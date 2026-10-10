import { createHash } from "node:crypto"
import { CliError } from "@wirecat/cli-core"
import type { Himalaya } from "./himalaya.js"

export interface Listed {
  uid: string
  /** Gmail's own ids: the same in every folder, and they survive a UID reset. */
  messageId: string
  threadId: string
  receivedAt: string
  folder?: string
  scopeFolder?: string
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const FETCH_BATCH = 500

const imapDate = (day: Date): string => `${day.getUTCDate()}-${MONTHS[day.getUTCMonth()]}-${day.getUTCFullYear()}`

/** IMAP's `INTERNALDATE`: `"04-Oct-2026 19:51:09 +0000"`. */
const isoOf = (internal: string): string => {
  const match = /^\s*(\d{1,2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(internal)
  if (match === null) throw new CliError("invalid_response", `unexpected IMAP date "${internal}"`)
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
      throw new CliError("provider_error", `IMAP command ${tag} did not complete: ${line}`)
    }
  }
}

/**
 * Every message in All Mail received since `since`, read with EXAMINE so nothing can change a flag.
 * All Mail rather than INBOX: an archived message leaves INBOX but is not deleted.
 */
export const listAllMail = async (
  run: Himalaya,
  account: string,
  since: Date,
  folder = "[Gmail]/All Mail",
): Promise<Listed[]> => {
  if (/[\r\n]/.test(folder) || folder.includes(String.fromCharCode(0)))
    throw new CliError("validation_error", "invalid mailbox name")
  const mailbox = JSON.stringify(folder)
  const search = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${mailbox}\r\nb UID SEARCH SINCE ${imapDate(since)}\r\n`,
  )
  assertCompleted(search, ["a", "b"])
  const uids = (/^\* SEARCH(.*)$/m.exec(search)?.[1] ?? "").trim().split(/\s+/).filter(Boolean)
  if (uids.length === 0) return []

  const batches: string[] = []
  for (let start = 0; start < uids.length; start += FETCH_BATCH)
    batches.push(uids.slice(start, start + FETCH_BATCH).join(","))
  const tags = batches.map((_, index) => `f${index}`)
  const fetched = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${mailbox}\r\n${batches
      .map((set, index) => `${tags[index]} UID FETCH ${set} (UID X-GM-MSGID X-GM-THRID INTERNALDATE)\r\n`)
      .join("")}`,
  )
  assertCompleted(fetched, ["a", ...tags])

  const listed = [...fetched.matchAll(/^\* \d+ FETCH \((.*)\)\s*$/gm)].map(([, items = ""]) => {
    const item = (name: string) => new RegExp(`${name} (\\d+)`).exec(items)?.[1]
    const internal = /INTERNALDATE "([^"]+)"/.exec(items)?.[1]
    const uid = item("UID")
    const messageId = item("X-GM-MSGID")
    const threadId = item("X-GM-THRID")
    if (!uid || !messageId || !threadId || !internal)
      throw new CliError("invalid_response", `IMAP FETCH answer without the Gmail ids: ${items}`)
    return { uid, messageId, threadId, receivedAt: isoOf(internal) }
  })
  if (listed.length !== uids.length)
    throw new CliError("invalid_response", `IMAP listed ${uids.length} messages but fetched ${listed.length}`)
  return listed
}

/** Message-ID is stable across folders; absent headers fall back to a UIDVALIDITY-scoped identity. */
export const listImapMail = async (run: Himalaya, account: string, since: Date, folder: string): Promise<Listed[]> => {
  if (!folder || /[\r\n]/.test(folder) || folder.includes(String.fromCharCode(0)))
    throw new CliError("validation_error", "invalid mailbox name")
  const mailbox = JSON.stringify(folder)
  const searched = await run(
    ["imap", "raw", "-a", account],
    `a EXAMINE ${mailbox}\r\nb UID SEARCH SINCE ${imapDate(since)}\r\n`,
  )
  assertCompleted(searched, ["a", "b"])
  const validity = /\[UIDVALIDITY (\d+)\]/.exec(searched)?.[1]
  if (!validity) throw new CliError("invalid_response", "IMAP did not report UIDVALIDITY")
  const uids = [...new Set((/^\* SEARCH(.*)$/m.exec(searched)?.[1] ?? "").trim().split(/\s+/).filter(Boolean))]
  if (!uids.every((uid) => /^\d+$/.test(uid))) throw new CliError("invalid_response", "invalid IMAP UID listing")
  const listed: Listed[] = []
  const digest = (id: string) => `imap:${createHash("sha256").update(id).digest("hex")}`
  for (let start = 0; start < uids.length; start += FETCH_BATCH) {
    const batch = uids.slice(start, start + FETCH_BATCH)
    const before = listed.length
    const output = await run(
      ["imap", "raw", "-a", account],
      `a EXAMINE ${mailbox}\r\nf UID FETCH ${batch.join(",")} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (MESSAGE-ID REFERENCES IN-REPLY-TO)])\r\n`,
    )
    assertCompleted(output, ["a", "f"])
    for (const match of output.matchAll(
      /^\* \d+ FETCH \(([\s\S]*?)(?=^\* \d+ FETCH|^[af] (?:OK|NO|BAD)|$(?![\s\S]))/gm,
    )) {
      const fields = match[1] ?? "",
        uid = /(?:^|\s)UID (\d+)/.exec(fields)?.[1],
        internal = /INTERNALDATE "([^"]+)"/.exec(fields)?.[1]
      if (!uid || !internal || !batch.includes(uid)) throw new CliError("invalid_response", "incomplete IMAP envelope")
      const unfolded = fields.replace(/\r?\n[ \t]+/g, " ")
      const messageId = /^Message-ID:\s*(.+)$/im.exec(unfolded)?.[1]?.trim()
      const refs = /^References:\s*(.+)$/im.exec(unfolded)?.[1]?.match(/<[^>]+>/g)
      const parent = /^In-Reply-To:\s*(<[^>]+>)/im.exec(unfolded)?.[1]
      const identity = messageId ?? `uid:${folder}:${validity}:${uid}`
      listed.push({
        uid,
        messageId: digest(identity),
        threadId: digest(refs?.[0] ?? parent ?? identity),
        receivedAt: isoOf(internal),
        folder,
      })
    }
    if (
      listed.length - before !== batch.length ||
      new Set(listed.slice(before).map((item) => item.uid)).size !== batch.length
    )
      throw new CliError("invalid_response", "IMAP returned a partial envelope batch; deletions were not checked")
  }
  return listed
}
