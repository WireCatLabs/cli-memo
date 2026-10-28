import { createHash } from "node:crypto"
import { CliError } from "@wirecat/cli-base"
import { HEADER_FIELDS, headersOf, type Listed, type Searched } from "@wirecat/cli-core/mail"
import { type Himalaya, isThrottled, throttledError } from "./himalaya.js"

const SYSTEM_LABELS: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  important: "Important",
  starred: "Starred",
  draft: "Drafts",
  drafts: "Drafts",
  spam: "Spam",
  trash: "Trash",
  junk: "Spam",
}

/** IMAP's modified UTF-7 (RFC 3501 §5.1.3): `&` opens base64 of UTF-16BE, `,` stands for `/`, `-` closes. */
export const decodeMailboxName = (name: string): string =>
  name.replace(/&([^-]*)-/g, (_, run: string) => {
    if (run === "") return "&"
    const bytes = Buffer.from(run.replace(/,/g, "/"), "base64")
    let text = ""
    for (let at = 0; at + 1 < bytes.length; at += 2) text += String.fromCharCode(bytes.readUInt16BE(at))
    return text
  })

/** The atoms and quoted strings of one parenthesised IMAP list, or undefined when it holds a literal. */
const imapList = (items: string, name: string): string[] | undefined => {
  const start = items.indexOf(`${name} (`)
  if (start === -1) return undefined
  const values: string[] = []
  for (let at = start + name.length + 2; at < items.length; ) {
    const c = items[at]
    if (c === ")") return values
    if (c === " ") at++
    else if (c === "{") return undefined
    else if (c === '"') {
      let value = ""
      for (at++; at < items.length && items[at] !== '"'; at++) value += items[at] === "\\" ? items[++at] : items[at]
      values.push(value)
      at++
    } else {
      const end = items.slice(at).search(/[ )]/)
      if (end === -1) return undefined
      values.push(items.slice(at, at + end))
      at += end
    }
  }
  return undefined
}

export const systemLabel = (name: string): string => SYSTEM_LABELS[name.toLowerCase()] ?? name

/** A label as people read it: `\\Important` and `Important` are one label, and names are decoded. */
export const labelName = (raw: string): string => {
  const system = raw.startsWith("\\") ? raw.slice(1) : raw
  return SYSTEM_LABELS[system.toLowerCase()] ?? decodeMailboxName(system)
}

/** One FETCH answer per email, across lines, since a header field comes back as a multi-line literal. */
const FETCH_ANSWERS = /^\* \d+ FETCH \(([\s\S]*?)(?=^\* \d+ FETCH|^[a-z]\d* (?:OK|NO|BAD)|$(?![\s\S]))/gm

/** Each answer's UID and header text; the UID is looked for outside the literal, so a header cannot fake it. */
const fetchedHeaders = (output: string): [string, string][] =>
  [...output.matchAll(FETCH_ANSWERS)].flatMap(([, fields = ""]) => {
    const literal = /\{\d+\}\r?\n/.exec(fields)
    if (literal === null) return []
    const start = literal.index + literal[0].length
    const blank = fields.slice(start).search(/\r?\n\r?\n/)
    const end = blank === -1 ? fields.length : start + blank
    const uid = /(?:^|\s)UID (\d+)/.exec(`${fields.slice(0, literal.index)} ${fields.slice(end)}`)?.[1]
    return uid === undefined ? [] : [[uid, fields.slice(start, end)] as [string, string]]
  })

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const FETCH_BATCH = 500
/** One himalaya call reads its whole answer into memory, so a large mailbox is listed in parts. */
const CALL_UIDS = 10_000

const imapDate = (day: Date): string => `${day.getUTCDate()}-${MONTHS[day.getUTCMonth()]}-${day.getUTCFullYear()}`

/** IMAP's `INTERNALDATE`: `"04-Oct-2026 19:51:09 +0000"`. */
const isoOf = (internal: string): string => {
  const match = /^\s*(\d{1,2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(internal)
  if (match === null)
    throw new CliError("invalid_response", `unexpected IMAP date "${internal}"`, { reason: "mail.invalid-imap" })
  const [, day, month, year, hour, minute, second, sign, offsetHours, offsetMinutes] = match
  const local = Date.UTC(
    Number(year),
    MONTHS.indexOf(month ?? ""),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000 * (sign === "-" ? -1 : 1)
  return new Date(local - offset).toISOString()
}

/** A tagged NO or BAD comes back as output, not as an error, so every tag must end in OK. */
const assertCompleted = (output: string, tags: string[]): void => {
  for (const tag of tags) {
    if (!new RegExp(`^${tag} OK`, "m").test(output)) {
      const line = output.split(/\r?\n/).find((text) => text.startsWith(`${tag} `)) ?? "no answer"
      // Gmail tags answers with [THROTTLED] even when another code says what failed, so that code goes first.
      if (/\[NONEXISTENT\]/.test(line))
        throw new CliError("provider_error", `IMAP command ${tag}: Gmail has no such mailbox: ${line}`, {
          reason: "mail.source-failed",
        })
      if (isThrottled(line)) throw throttledError(`IMAP command ${tag}`)
      throw new CliError("provider_error", `IMAP command ${tag} did not complete: ${line}`, {
        reason: "mail.source-failed",
      })
    }
  }
}

const mailboxOf = (folder: string): string => {
  if (!folder || /[\r\n]/.test(folder) || folder.includes(String.fromCharCode(0)))
    throw new CliError("validation_error", "invalid mailbox name")
  return JSON.stringify(folder)
}

/**
 * All Mail and Trash found by their roles (RFC 6154 `\\All`, `\\Trash`): Gmail names them in the account's
 * language, so Trash is `[Gmail]/Bin` in UK English.
 */
export const specialFolders = async (run: Himalaya, account: string): Promise<{ all: string; trash: string }> => {
  const listed = await run(["imap", "raw", "-a", account], `a LIST "" "*"\r\n`)
  assertCompleted(listed, ["a"])
  let all: string | undefined
  let trash: string | undefined
  for (const line of listed.split(/\r?\n/)) {
    const hit = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/.exec(line)
    if (!hit) continue
    const [, flags = "", raw = ""] = hit
    const name = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw
    if (/\\All\b/.test(flags)) all = name
    if (/\\Trash\b/.test(flags)) trash = name
  }
  if (all === undefined || trash === undefined)
    throw new CliError("provider_error", "Gmail listed no All Mail or Trash folder", { reason: "mail.source-failed" })
  return { all, trash }
}

/** One cheap call: the UIDs a listing would fetch, so a rerun can fetch only those not done before. */
export const searchMail = async (run: Himalaya, account: string, since: Date, folder: string): Promise<Searched> => {
  const searched = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${mailboxOf(folder)}\r\nb UID SEARCH SINCE ${imapDate(since)}\r\n`,
  )
  assertCompleted(searched, ["a", "b"])
  const validity = /\[UIDVALIDITY (\d+)\]/.exec(searched)?.[1]
  const uids = [...new Set((/^\* SEARCH(.*)$/m.exec(searched)?.[1] ?? "").trim().split(/\s+/).filter(Boolean))]
  if (!uids.every((uid) => /^\d+$/.test(uid)))
    throw new CliError("invalid_response", "invalid IMAP UID listing", { reason: "mail.invalid-imap" })
  return { ...(validity === undefined ? {} : { validity }), uids }
}

/** Gmail ids looked up per call; each is one `UID SEARCH` line of the same answer. */
const IDS_PER_CALL = 200

/**
 * The UIDs of messages known by their Gmail id, through Gmail's `X-GM-MSGID` search (Gmail IMAP extensions); a
 * message gone from `folder` has none, so it is simply not in the answer.
 */
export const uidsOfMessages = async (
  run: Himalaya,
  account: string,
  messageIds: readonly string[],
  folder = "[Gmail]/All Mail",
): Promise<string[]> => {
  if (!messageIds.every((id) => /^\d+$/.test(id)))
    throw new CliError("validation_error", "a Gmail message id is a number", { reason: "mail.invalid-imap" })
  const mailbox = mailboxOf(folder)
  const uids = new Set<string>()
  for (let from = 0; from < messageIds.length; from += IDS_PER_CALL) {
    const ids = messageIds.slice(from, from + IDS_PER_CALL)
    const tags = ids.map((_, index) => `s${index}`)
    const searched = await run(
      ["imap", "raw", "-a", account],
      `a EXAMINE ${mailbox}\r\n${ids.map((id, index) => `${tags[index]} UID SEARCH X-GM-MSGID ${id}\r\n`).join("")}`,
    )
    assertCompleted(searched, ["a", ...tags])
    for (const [, found = ""] of searched.matchAll(/^\* SEARCH(.*)$/gm))
      for (const uid of found.trim().split(/\s+/).filter(Boolean)) uids.add(uid)
  }
  if (![...uids].every((uid) => /^\d+$/.test(uid)))
    throw new CliError("invalid_response", "invalid IMAP UID listing", { reason: "mail.invalid-imap" })
  return [...uids]
}

/** Each Gmail id's UID in `folder`; an id the folder does not hold is absent from the map. */
const uidsById = async (
  run: Himalaya,
  account: string,
  messageIds: readonly string[],
  folder: string,
): Promise<Map<string, string>> => {
  if (!messageIds.every((id) => /^\d+$/.test(id)))
    throw new CliError("validation_error", "a Gmail message id is a number", { reason: "mail.invalid-imap" })
  const found = new Map<string, string>()
  for (let from = 0; from < messageIds.length; from += IDS_PER_CALL) {
    const ids = messageIds.slice(from, from + IDS_PER_CALL)
    const tags = ids.map((_, index) => `s${index}`)
    const searched = await run(
      ["imap", "raw", "-a", account],
      `a EXAMINE ${mailboxOf(folder)}\r\n${ids.map((id, index) => `${tags[index]} UID SEARCH X-GM-MSGID ${id}\r\n`).join("")}`,
    )
    assertCompleted(searched, ["a", ...tags])
    // Each untagged SEARCH answers the next tagged command, so answers pair with ids in order.
    let pending: string | undefined
    for (const line of searched.split(/\r?\n/)) {
      const hit = /^\* SEARCH(.*)$/.exec(line)
      if (hit) pending = hit[1]?.trim().split(/\s+/).filter(Boolean)[0]
      const done = /^s(\d+) OK/.exec(line)
      if (done) {
        const id = ids[Number(done[1])]
        if (id !== undefined && pending !== undefined && /^\d+$/.test(pending)) found.set(id, pending)
        pending = undefined
      }
    }
  }
  return found
}

/** An IMAP quoted string escapes `\` and `"` as JSON does. */
const quoted = (name: string): string => JSON.stringify(name)

/**
 * Moves the messages with these Gmail ids from `from` to `to` with `UID MOVE` (RFC 6851, which Gmail lists in its
 * CAPABILITY). On Gmail a move to `[Gmail]/Trash` takes a message out of All Mail and drops `\Inbox`, keeping its
 * other labels; a move back to `INBOX` or `[Gmail]/All Mail` returns it (checked on a test account, 2026-10-16).
 */
export const moveMessages = async (
  run: Himalaya,
  account: string,
  messageIds: readonly string[],
  from: string,
  to: string,
  known?: ReadonlyMap<string, string>,
): Promise<{ moved: string[]; missing: string[] }> => {
  const uids = known ?? (await uidsById(run, account, messageIds, from))
  const missing = messageIds.filter((id) => !uids.has(id))
  if (uids.size === 0) return { moved: [], missing }
  const moved = await run(
    ["imap", "raw", "-a", account],
    `a SELECT ${mailboxOf(from)}\r\nm UID MOVE ${[...uids.values()].join(",")} ${mailboxOf(to)}\r\n`,
  )
  assertCompleted(moved, ["a", "m"])
  return { moved: [...uids.keys()], missing }
}

/** Which of these UIDs `folder` still holds: one `UID SEARCH`, where looking each message up by Gmail id is one per. */
export const uidsPresent = async (
  run: Himalaya,
  account: string,
  uids: readonly string[],
  folder: string,
): Promise<string[]> => {
  if (uids.length === 0) return []
  if (!uids.every((uid) => /^\d+$/.test(uid)))
    throw new CliError("validation_error", "a UID is a number", { reason: "mail.invalid-imap" })
  const searched = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${mailboxOf(folder)}\r\nb UID SEARCH UID ${uids.join(",")}\r\n`,
  )
  assertCompleted(searched, ["a", "b"])
  return (/^\* SEARCH(.*)$/m.exec(searched)?.[1] ?? "").trim().split(/\s+/).filter(Boolean)
}

/** Puts Gmail labels back on messages in `folder`; a label a message already has is left as it is. */
export const addLabels = async (
  run: Himalaya,
  account: string,
  messageIds: readonly string[],
  folder: string,
  labels: readonly string[],
): Promise<void> => {
  if (labels.length === 0) return
  const uids = await uidsById(run, account, messageIds, folder)
  if (uids.size === 0) return
  const names = labels.map(quoted).join(" ")
  const stored = await run(
    ["imap", "raw", "-a", account],
    `a SELECT ${mailboxOf(folder)}\r\nl UID STORE ${[...uids.values()].join(",")} +X-GM-LABELS (${names})\r\n`,
  )
  assertCompleted(stored, ["a", "l"])
}

/**
 * Every message in All Mail received since `since`, read with EXAMINE so nothing can change a flag.
 * All Mail rather than INBOX: an archived message leaves INBOX but is not deleted.
 * `searched` limits it to those UIDs, from `searchMail`, so mail done in an earlier run is not fetched again.
 */
export const listAllMail = async (
  run: Himalaya,
  account: string,
  since: Date,
  folder = "[Gmail]/All Mail",
  headers = false,
  searched?: Searched,
): Promise<Listed[]> => {
  const mailbox = mailboxOf(folder)
  const { uids } = searched ?? (await searchMail(run, account, since, folder))
  if (uids.length === 0) return []

  const listed: Omit<Listed, "labels" | "seen" | "flagged">[] = []
  const marks = new Map<string, Pick<Listed, "labels" | "seen" | "flagged" | "headers">>()
  for (let from = 0; from < uids.length; from += CALL_UIDS) {
    const batches: string[] = []
    for (let start = from; start < Math.min(from + CALL_UIDS, uids.length); start += FETCH_BATCH)
      batches.push(uids.slice(start, start + FETCH_BATCH).join(","))
    const tags = batches.map((_, index) => `f${index}`)
    const fetched = await run(
      ["imap", "raw", "-a", account],
      `a EXAMINE ${mailbox}\r\n${batches
        .map((set, index) => `${tags[index]} UID FETCH ${set} (UID X-GM-MSGID X-GM-THRID INTERNALDATE RFC822.SIZE)\r\n`)
        .join("")}`,
    )
    assertCompleted(fetched, ["a", ...tags])
    for (const [, items = ""] of fetched.matchAll(/^\* \d+ FETCH \((.*)\)\s*$/gm)) {
      const item = (name: string) => new RegExp(`${name} (\\d+)`).exec(items)?.[1]
      const internal = /INTERNALDATE "([^"]+)"/.exec(items)?.[1]
      const uid = item("UID")
      const messageId = item("X-GM-MSGID")
      const threadId = item("X-GM-THRID")
      const size = item("RFC822\\.SIZE")
      if (!uid || !messageId || !threadId || !internal)
        throw new CliError("invalid_response", `IMAP FETCH answer without the Gmail ids: ${items}`, {
          reason: "mail.invalid-imap",
        })
      listed.push({
        uid,
        messageId,
        threadId,
        receivedAt: isoOf(internal),
        ...(size === undefined ? {} : { size: Number(size) }),
      })
    }

    // A separate answer, so a label the parser cannot read costs that message its labels, never the listing.
    const labelled = await run(
      ["imap", "raw", "-a", account],
      `a EXAMINE ${mailbox}\r\n${batches
        .map((set, index) => `l${index} UID FETCH ${set} (UID X-GM-LABELS FLAGS)\r\n`)
        .join("")}`,
    )
    for (const [, items = ""] of labelled.matchAll(/^\* \d+ FETCH \((.*)\)\s*$/gm)) {
      const uid = /(?:^|\s)UID (\d+)/.exec(items)?.[1]
      const labels = imapList(items, "X-GM-LABELS")
      const flags = imapList(items, "FLAGS")
      if (!uid || labels === undefined || flags === undefined) continue
      const flagged = flags.includes("\\Flagged")
      const names = new Set(labels.map(labelName))
      if (flagged) names.add("Starred")
      marks.set(uid, { labels: [...names].sort(), seen: flags.includes("\\Seen"), flagged })
    }

    if (headers) {
      const headed = await run(
        ["imap", "raw", "-a", account],
        `a EXAMINE ${mailbox}\r\n${batches
          .map((set, index) => `h${index} UID FETCH ${set} (UID BODY.PEEK[HEADER.FIELDS (${HEADER_FIELDS})])\r\n`)
          .join("")}`,
      )
      // A refused fetch would leave a whole batch without headers, and rules would not keep its mail out.
      assertCompleted(headed, ["a", ...batches.map((_, index) => `h${index}`)])
      for (const [uid, text] of fetchedHeaders(headed)) marks.set(uid, { ...marks.get(uid), headers: headersOf(text) })
    }
  }
  if (listed.length !== uids.length)
    throw new CliError("invalid_response", `IMAP listed ${uids.length} messages but fetched ${listed.length}`, {
      reason: "mail.invalid-imap",
    })
  return listed.map((item) => ({ ...item, ...marks.get(item.uid) }))
}

/** Message-ID is stable across folders; absent headers fall back to a UIDVALIDITY-scoped identity. */
export const listImapMail = async (
  run: Himalaya,
  account: string,
  since: Date,
  folder: string,
  searched?: Searched,
): Promise<Listed[]> => {
  const mailbox = mailboxOf(folder)
  const { validity, uids } = searched ?? (await searchMail(run, account, since, folder))
  // Without Message-ID the identity is the UID, which means nothing without its UIDVALIDITY.
  if (!validity)
    throw new CliError("invalid_response", "IMAP did not report UIDVALIDITY", { reason: "mail.invalid-imap" })
  const listed: Listed[] = []
  const digest = (id: string) => `imap:${createHash("sha256").update(id).digest("hex")}`
  for (let start = 0; start < uids.length; start += FETCH_BATCH) {
    const batch = uids.slice(start, start + FETCH_BATCH)
    const before = listed.length
    const output = await run(
      ["imap", "raw", "-a", account],
      `a EXAMINE ${mailbox}\r\nf UID FETCH ${batch.join(",")} (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (MESSAGE-ID REFERENCES IN-REPLY-TO ${HEADER_FIELDS})])\r\n`,
    )
    assertCompleted(output, ["a", "f"])
    for (const match of output.matchAll(
      /^\* \d+ FETCH \(([\s\S]*?)(?=^\* \d+ FETCH|^[af] (?:OK|NO|BAD)|$(?![\s\S]))/gm,
    )) {
      const fields = match[1] ?? "",
        uid = /(?:^|\s)UID (\d+)/.exec(fields)?.[1],
        internal = /INTERNALDATE "([^"]+)"/.exec(fields)?.[1]
      if (!uid || !internal || !batch.includes(uid))
        throw new CliError("invalid_response", "incomplete IMAP envelope", { reason: "mail.invalid-imap" })
      const unfolded = fields.replace(/\r?\n[ \t]+/g, " ")
      const messageId = /^Message-ID:\s*(.+)$/im.exec(unfolded)?.[1]?.trim()
      const refs = /^References:\s*(.+)$/im.exec(unfolded)?.[1]?.match(/<[^>]+>/g)
      const parent = /^In-Reply-To:\s*(<[^>]+>)/im.exec(unfolded)?.[1]
      const identity = messageId ?? `uid:${folder}:${validity}:${uid}`
      const flags = imapList(fields, "FLAGS")
      const size = /RFC822\.SIZE (\d+)/.exec(fields)?.[1]
      listed.push({
        uid,
        ...(size === undefined ? {} : { size: Number(size) }),
        messageId: digest(identity),
        threadId: digest(refs?.[0] ?? parent ?? identity),
        receivedAt: isoOf(internal),
        folder,
        headers: headersOf(unfolded),
        // IMAP has no labels; a flagged message is Starred, as in Gmail, so one search finds both.
        ...(flags === undefined
          ? {}
          : {
              labels: flags.includes("\\Flagged") ? ["Starred"] : [],
              seen: flags.includes("\\Seen"),
              flagged: flags.includes("\\Flagged"),
            }),
      })
    }
    if (
      listed.length - before !== batch.length ||
      new Set(listed.slice(before).map((item) => item.uid)).size !== batch.length
    )
      throw new CliError("invalid_response", "IMAP returned a partial envelope batch; deletions were not checked", {
        reason: "mail.invalid-imap",
      })
  }
  return listed
}
