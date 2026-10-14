import { extractText, importEngine, type LoadEngine } from "@wirecat/cli-core/documents"
import type { AccountKey, AttachmentInput, EmailAddress, MessageStore } from "@wirecat/cli-core/store"
import { embedChanged, embedMailChunks, type NotesEmbedded } from "../notes/embed.js"
import { dropMissing, tooManyGone } from "../store/gone.js"
import { mailFolders } from "./accounts.js"
import { mailHeadersOf } from "./headers.js"
import { type Address, MAX_BODY_CHARS, type ParsedMail, parseMail } from "./parse.js"
import {
  FULL_PASS_MS,
  MBOX_RESUME,
  type MboxPoint,
  mergeRanges,
  parsePoint,
  type Ranges,
  type ResumePoint,
  rangesOf,
  resumeKey,
  rulesKey,
  within,
} from "./resume.js"
import { decide, ENVELOPE, envelopeBox, envelopeBoxOf, type MailRule } from "./rules.js"
import type { Listed, MailSource, Searched } from "./source.js"

export interface MailAccount {
  /** The account's name in Himalaya's config. */
  name: string
  /** The mailbox address: the store's account id. */
  address: string
  mode?: "gmail" | "imap" | "mbox"
  folders?: string[]
  embed?: boolean
  rules?: MailRule[]
}

export interface ImportResult {
  account: string
  since: string
  listed: number
  saved: number
  alreadyStored: number
  /** New emails a skip rule kept out: never read, never stored. */
  skipped: number
  /** New emails an envelope rule recorded: sender, date, size and labels, never their text. */
  envelopes: number
  deleted: number
  /** False when `max` stopped the run before every new message was read; the next run continues. */
  complete: boolean
  /** Emails that could not be read or parsed; they are tried again next run. */
  unreadable?: { message: string; reason: string }[]
  /** Why stored messages missing at the source were left alone, when they were. */
  deletionsSkipped?: string
  /** "resumed": only mail not done before was listed; "full": every message in the window was. */
  pass?: "full" | "resumed"
  indexed?: NotesEmbedded
  coverage?: { folders: string[]; since: string; until: string; state: "window" | "partial"; identity: string }
  attachments?: { message: string; part: number; status: string }[]
}

const DAY = 86_400_000
/** IMAP's SINCE counts whole days in the server's zone, so the window's first days are not trusted. */
const EDGE = 2 * DAY
export const MAX_ATTACHMENT_CHARS = 200_000
/** One chunk of raw mail is held in memory at a time. */
const FETCH_CHUNK = 50
/** How often a long run saves where it is, so a kill costs at most this much listing again. */
const SAVE_EVERY_MS = 30_000
/** About a minute of listing; the 30-day window of the timer stays below it. */
const RESUME_FROM = 5_000

const addressOf = ({ email, name }: Address): EmailAddress => ({ address: email, name })

export const importMail = async ({
  store,
  source,
  account,
  since,
  max = 200,
  maxBodyChars = MAX_BODY_CHARS,
  maxAttachmentChars = MAX_ATTACHMENT_CHARS,
  now = Date.now,
  env,
  embed = false,
  loadEngine = importEngine,
  retryAttachments = false,
  rescan = false,
  resumeFrom = RESUME_FROM,
  indexThreads = embedChanged,
  embedMail = embedMailChunks,
}: {
  store: MessageStore
  source: MailSource
  account: MailAccount
  since: Date
  max?: number
  maxBodyChars?: number
  maxAttachmentChars?: number
  now?: () => number
  env?: NodeJS.ProcessEnv
  embed?: boolean
  loadEngine?: LoadEngine
  retryAttachments?: boolean
  /** List every message in the window, not only those an earlier run left: proves deletions, refreshes labels. */
  rescan?: boolean
  /** A window smaller than this is listed whole every run: it costs seconds and keeps flags and deletions current. */
  resumeFrom?: number
  indexThreads?: typeof embedChanged
  embedMail?: typeof embedMailChunks
}): Promise<ImportResult> => {
  const startedAt = now()
  const key: AccountKey = { provider: "email", account: account.address.toLowerCase() }
  const accountId = await store.saveAccount(key, { name: account.address })

  const folders = mailFolders(account)
  if (folders.length < 1 || folders.length > 50) throw new Error("select 1–50 mail folders")
  const rules = account.rules ?? []
  // An archive file is a snapshot of the same account: it adds mail, and changes nothing IMAP keeps current.
  const snapshot = account.mode === "mbox"
  const ruleSet = rulesKey(rules)
  const collected: Listed[] = []
  const searches = new Map<string, Searched>()
  /** The earlier point of each folder whose UIDs and rules still hold; its done mail stays done. */
  const earlier = new Map<string, ResumePoint>()
  const resumed = new Set<string>()
  let mboxPoint: MboxPoint | undefined
  let mboxStamp: Awaited<ReturnType<NonNullable<MailSource["stamp"]>>> | undefined
  // A rerun lists only what the last left; --rescan, a rule change or a new UIDVALIDITY lists everything again.
  const fresh = rescan || retryAttachments
  if (snapshot && source.stamp !== undefined) {
    mboxStamp = await source.stamp()
    const point = fresh ? undefined : parsePoint<MboxPoint>((await store.syncState(key, MBOX_RESUME))?.value)
    if (point?.complete && point.size === mboxStamp.size && point.mtimeMs === mboxStamp.mtimeMs) mboxPoint = point
  }
  for (const folder of folders) {
    if (mboxPoint !== undefined) break
    const searched = source.search === undefined || snapshot ? undefined : await source.search(since, folder)
    let wanted = searched
    if (searched !== undefined) {
      searches.set(folder, searched)
      const point = fresh ? undefined : parsePoint<ResumePoint>((await store.syncState(key, resumeKey(folder)))?.value)
      if (point !== undefined && point.validity === searched.validity && point.rules === ruleSet) {
        earlier.set(folder, point)
        if (
          searched.uids.length >= resumeFrom &&
          Date.parse(point.full.since) <= since.getTime() &&
          startedAt - Date.parse(point.full.at) < FULL_PASS_MS
        ) {
          resumed.add(folder)
          wanted = { ...searched, uids: searched.uids.filter((uid) => !within(point.done, Number(uid))) }
        }
      }
    }
    const found = await source.list(since, folder, {
      headers: rules.length > 0,
      ...(wanted === undefined ? {} : { searched: wanted }),
    })
    // Spreading a whole mailbox into push() overflows the stack past ~120,000 emails.
    for (const item of found) collected.push(item)
  }
  const listed = [...new Map(collected.map((item) => [item.messageId, item])).values()].sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt),
  )
  const present = new Set(listed.map(({ messageId }) => messageId))
  const foundFolders = new Map<string, Set<string>>()
  for (const item of collected) {
    const current = foundFolders.get(item.messageId) ?? new Set<string>()
    current.add(item.folder ?? (folders[0] as string))
    foundFolders.set(item.messageId, current)
  }
  const mailbox = (folder: string) => ({ externalId: folder, name: folder, kind: null })
  const label = (name: string) => ({ externalId: `label:${name}`, name, kind: "label" })
  const labelsOf = new Map(collected.flatMap((item) => (item.labels === undefined ? [] : [[item.messageId, item]])))
  const allMailOnly = account.mode !== "imap" && folders.length === 1 && folders[0] === "[Gmail]/All Mail"

  // Deletions are proved against the mailboxes as stored before this scan moves anything.
  const scope = JSON.stringify({ mode: account.mode ?? "gmail", folders: [...folders].sort() })
  const previousScope = snapshot ? undefined : await store.syncState(key, "mail_folder_scope")
  const windowStart = new Date(since.getTime() + EDGE)
  let deleted = 0
  let skipped: string | undefined
  if (snapshot) skipped = "an mbox file is a snapshot; mail missing from it is not proven deleted"
  else if (resumed.size > 0)
    skipped =
      "this run listed only mail not read before; a full listing, at least daily or with --rescan, checks deletions"
  else if (previousScope !== undefined && previousScope.value !== scope)
    skipped = "folder scope changed; missing mail is not proven deleted"
  else {
    // A label is not where mail lives, so only folders prove that a missing mail was deleted.
    const candidates = (await store.mail.emailRefs({ accountId, since: windowStart.getTime() })).filter(
      ({ mailboxes }) => {
        const inFolders = mailboxes.filter(({ kind }) => kind !== "label" && kind !== ENVELOPE)
        return inFolders.length ? inFolders.every(({ externalId }) => folders.includes(externalId)) : allMailOnly
      },
    )
    const gone = candidates.filter(({ externalId }) => !present.has(externalId)).map(({ externalId }) => externalId)
    skipped = tooManyGone(gone.length, candidates.length)
    if (!skipped && gone.length) deleted = await store.mail.markDeleted(accountId, gone, startedAt)
    // Mail an earlier import saved as messages keeps the rule it was saved under until those rows are removed.
    const older = await dropMissing(
      store,
      key,
      { has: (id) => present.has(id.replace(/:attachment:\d+$/, "")) },
      windowStart.toISOString(),
      async ({ id }) => {
        const membership = await store.syncState(key, `mail_message_folders:${id.replace(/:attachment:\d+$/, "")}`)
        if (membership === undefined) return allMailOnly
        return (JSON.parse(membership.value) as string[]).every((folder) => folders.includes(folder))
      },
    )
    deleted += older.deleted
    skipped ??= older.skipped
  }
  if (!snapshot)
    await store.mail.setMailboxes(
      accountId,
      folders.map(mailbox),
      new Map([...foundFolders].map(([id, found]) => [id, [...found]])),
      startedAt,
    )
  // A message's label list is whole, so every label the account has is replaced for each message read.
  if (labelsOf.size && !snapshot) {
    const known = (await store.mail.mailboxes(accountId)).filter(({ kind }) => kind === "label")
    const seen = [...labelsOf.values()].flatMap(({ labels }) => labels ?? [])
    const scanned = new Map([
      ...known.map(({ name }) => [name, label(name)] as const),
      ...seen.map((name) => [name, label(name)] as const),
    ])
    await store.mail.setMailboxes(
      accountId,
      [...scanned.values()],
      new Map([...labelsOf].map(([id, { labels }]) => [id, (labels ?? []).map((name) => label(name).externalId)])),
      startedAt,
    )
  }

  const attachments: NonNullable<ImportResult["attachments"]> = []
  const unreadable: NonNullable<ImportResult["unreadable"]> = []
  let saved = 0
  let alreadyStored = 0
  let ruledOut = 0
  let envelopes = 0
  const pending: Listed[] = []
  // IMAP lists what exists now, so a mail marked deleted that it lists again is saved again, which brings it back.
  // An archive is old: what it holds that IMAP proved deleted stays deleted.
  const refs = await store.mail.emailRefs({ accountId, includeDeleted: snapshot })
  const known = new Set(refs.map(({ externalId }) => externalId))
  const stored = retryAttachments ? new Set<string>() : known
  const enveloped = new Map(
    refs.flatMap(({ externalId, mailboxes }) => {
      const boxes = mailboxes.filter(({ kind }) => kind === ENVELOPE).map((box) => box.externalId)
      return boxes.length ? [[externalId, boxes] as const] : []
    }),
  )
  const upgraded = new Map<string, string[]>()
  const toRecord: { item: Listed; rule: MailRule }[] = []
  // Mail whose outcome is final under these rules; only these UIDs are skipped by the next run's listing.
  const settled = new Set<string>()
  let full = false
  for (const item of listed) {
    const rule = decide(rules, item.headers)
    const boxes = enveloped.get(item.messageId)
    // An envelope whose rule is gone or now keeps the mail is read in full; one a skip now matches stays as it is.
    if (boxes !== undefined && rule?.action !== ENVELOPE && rule?.action !== "skip") {
      if (pending.length < max) {
        upgraded.set(item.messageId, boxes)
        pending.push(item)
      } else full = true
      continue
    }
    if (stored.has(item.messageId)) {
      alreadyStored++
      settled.add(item.messageId)
      continue
    }
    // Stored mail a newer skip or envelope rule matches stays whole: removing it is a separate, explicit step.
    if (rule?.action === "skip") {
      ruledOut++
      settled.add(item.messageId)
      continue
    }
    if (rule?.action === ENVELOPE) {
      if (!known.has(item.messageId)) toRecord.push({ item, rule })
      else {
        alreadyStored++
        settled.add(item.messageId)
      }
      continue
    }
    if (pending.length < max) pending.push(item)
    else full = true
  }
  const inMailboxes = (item: Listed) => [
    ...[...(foundFolders.get(item.messageId) ?? [])].map(mailbox),
    ...(labelsOf.get(item.messageId)?.labels ?? []).map(label),
  ]
  const flagsOf = (item: Listed) => {
    const { seen, flagged } = labelsOf.get(item.messageId) ?? {}
    return { ...(seen === undefined ? {} : { read: seen }), ...(flagged === undefined ? {} : { flagged }) }
  }
  const uidsOf = new Map<string, Map<string, number[]>>()
  for (const item of collected) {
    const folder = item.folder ?? (folders[0] as string)
    if (!searches.has(folder)) continue
    const inFolder = uidsOf.get(folder) ?? new Map<string, number[]>()
    inFolder.set(item.messageId, [...(inFolder.get(item.messageId) ?? []), Number(item.uid)])
    uidsOf.set(folder, inFolder)
  }
  const saveProgress = async () => {
    for (const [folder, searched] of searches) {
      if (searched.validity === undefined) continue
      const done: number[] = []
      for (const [messageId, uids] of uidsOf.get(folder) ?? []) if (settled.has(messageId)) done.push(...uids)
      const before = earlier.get(folder)
      // A narrower whole listing, like the timer's 30 days, does not replace a wider one that is still fresh.
      const keepFull =
        before !== undefined &&
        (resumed.has(folder) ||
          (Date.parse(before.full.since) < since.getTime() && startedAt - Date.parse(before.full.at) < FULL_PASS_MS))
      const merged = mergeRanges(before?.done ?? ([] as Ranges), rangesOf(done))
      const widest = before === undefined || since.getTime() <= Date.parse(before.window.since)
      const point: ResumePoint = {
        validity: searched.validity,
        done: merged,
        rules: ruleSet,
        full: keepFull ? before.full : { since: since.toISOString(), at: new Date(startedAt).toISOString() },
        window: widest
          ? {
              since: since.toISOString(),
              total: searched.uids.length,
              done: searched.uids.filter((uid) => within(merged, Number(uid))).length,
            }
          : before.window,
        updatedAt: new Date(now()).toISOString(),
      }
      await store.setSyncState(key, resumeKey(folder), JSON.stringify(point))
    }
  }
  let savedAt = now()
  const saveNow = async (force = false) => {
    if (!force && now() - savedAt < SAVE_EVERY_MS) return
    savedAt = now()
    await saveProgress()
  }
  await saveNow(true)

  // An envelope costs nothing more from the source: its fields were read with the listing.
  for (const { item, rule } of toRecord) {
    const headers = item.headers
    await store.mail.saveThread({
      accountId,
      externalId: item.threadId,
      now: startedAt,
      emails: [
        {
          externalId: item.messageId,
          // Subject and text stay out of the columns search reads, so recorded mail is never a search hit.
          subject: null,
          from: headers?.from === undefined ? null : { address: headers.from, name: headers.fromName ?? null },
          sentAt: null,
          receivedAt: Date.parse(item.receivedAt),
          bodyText: null,
          size: item.size ?? null,
          outgoing: headers?.from === key.account,
          mailboxes: [...inMailboxes(item), envelopeBox(rule.match)],
          ...flagsOf(item),
          metadata: {
            rule: { action: rule.action, match: { ...rule.match } },
            ...(headers?.subject ? { subject: headers.subject } : {}),
            ...(headers?.listId ? { listId: headers.listId } : {}),
            ...(headers?.replyTo ? { replyTo: headers.replyTo } : {}),
            ...(headers?.auth ? { auth: { ...headers.auth } } : {}),
          },
        },
      ],
    })
    envelopes++
    settled.add(item.messageId)
    await saveNow()
  }
  for (let start = 0; start < pending.length; start += FETCH_CHUNK) {
    const chunk = pending.slice(start, start + FETCH_CHUNK)
    const raws = await source.fetchRaw(chunk)
    // Every email of a chunk failing is the connection or the login, not the mail: stop instead of trying the rest.
    if (chunk.length > 1 && raws.every((raw) => raw instanceof Error)) throw raws[0]
    for (const [index, item] of chunk.entries()) {
      let mail: ParsedMail
      try {
        const raw = raws[index]
        if (raw === undefined || raw instanceof Error) throw raw ?? new Error("not read")
        mail = await parseMail(raw, maxBodyChars)
      } catch (error) {
        unreadable.push({ message: item.messageId, reason: error instanceof Error ? error.message : String(error) })
        continue
      }
      const header = mailHeadersOf(raws[index] as Uint8Array)
      const files: AttachmentInput[] = []
      for (const [position, part] of mail.attachments.entries()) {
        const extraction =
          part.bytes === null
            ? { status: "unavailable" as const }
            : await extractText(
                part.bytes,
                { kind: "file", name: part.name, mime: part.mime, path: part.name },
                loadEngine,
              )
        attachments.push({ message: item.messageId, part: part.id, status: extraction.status })
        const extracted = extraction.status === "extracted" ? extraction : undefined
        files.push({
          position,
          kind: "file",
          mime: part.mime,
          name: part.name,
          title: null,
          url: null,
          size: part.bytes === null ? null : part.bytes.byteLength,
          width: null,
          height: null,
          duration: null,
          providerRef: { message: item.messageId, part: part.id },
          localPath: null,
          text: extracted ? extracted.text.slice(0, maxAttachmentChars) : null,
          normalizedText: null,
          extraction: extracted ? "text" : "failed",
          extractor: extracted ? extracted.extractor : null,
          extractionError: extracted ? null : extraction.status,
          contentSha256: null,
          extractedAt: startedAt,
        })
      }
      await store.mail.saveThread({
        accountId,
        externalId: item.threadId,
        now: startedAt,
        emails: [
          {
            externalId: item.messageId,
            subject: mail.subject,
            from: mail.from === null ? null : addressOf(mail.from),
            to: mail.to.map(addressOf),
            cc: mail.cc.map(addressOf),
            bcc: mail.bcc.map(addressOf),
            sentAt: null,
            receivedAt: Date.parse(item.receivedAt),
            bodyText: mail.text || null,
            size: item.size ?? null,
            ...(Object.keys(header).length ? { headers: header } : {}),
            outgoing: mail.from === null ? null : mail.from.email === key.account,
            mailboxes: inMailboxes(item),
            ...flagsOf(item),
            ...(upgraded.has(item.messageId) ? { metadata: {} } : {}),
            attachments: files,
          },
        ],
      })
      saved++
      settled.add(item.messageId)
      const boxes = upgraded.get(item.messageId)
      if (boxes !== undefined)
        await store.mail.setMailboxes(accountId, boxes.map(envelopeBoxOf), new Map([[item.messageId, []]]), startedAt)
    }
    await saveNow()
  }
  await saveNow(true)
  if (snapshot && mboxStamp !== undefined && mboxPoint === undefined) {
    const point: MboxPoint = {
      ...mboxStamp,
      complete: !full && unreadable.length === 0,
      updatedAt: new Date(now()).toISOString(),
    }
    await store.setSyncState(key, MBOX_RESUME, JSON.stringify(point))
  }

  // Read and starred change at the source after import; mail saved in this run already holds them.
  if (!snapshot)
    await store.mail.setFlags(
      accountId,
      new Map(
        [...labelsOf].flatMap(([id, { seen, flagged }]) =>
          seen === undefined && flagged === undefined
            ? []
            : [[id, { ...(seen === undefined ? {} : { read: seen }), ...(flagged === undefined ? {} : { flagged }) }]],
        ),
      ),
      startedAt,
    )

  const complete = !full && unreadable.length === 0
  if (!snapshot) await store.setSyncState(key, "mail_folder_scope", scope)
  const embedding = { embed: embed && account.embed !== false, ...(env === undefined ? {} : { env }) }
  // Chats an earlier import saved as messages may still wait for vectors; the mail tables have their own.
  const older = await indexThreads(store, key, [], embedding)
  const mail = await embedMail(store, embedding)
  const indexed: NotesEmbedded = {
    ...older,
    chunks: older.chunks + mail.chunks,
    left: older.left || mail.left,
    ...(mail.notEmbedded === undefined ? {} : { notEmbedded: mail.notEmbedded }),
  }
  const coverage = {
    folders,
    since: since.toISOString(),
    until: new Date(startedAt).toISOString(),
    state: complete ? ("window" as const) : ("partial" as const),
    identity: account.mode === "imap" ? "message-id-or-uidvalidity-folder-uid" : "gmail-message-id",
  }
  if (!snapshot) await store.setSyncState(key, "mail_coverage", JSON.stringify(coverage))
  return {
    account: key.account,
    since: since.toISOString(),
    listed: listed.length,
    saved,
    alreadyStored,
    skipped: ruledOut,
    envelopes,
    deleted,
    complete,
    indexed,
    coverage,
    ...(attachments.length ? { attachments } : {}),
    ...(unreadable.length ? { unreadable } : {}),
    ...(skipped === undefined ? {} : { deletionsSkipped: skipped }),
    ...(searches.size > 0 ? { pass: resumed.size > 0 ? ("resumed" as const) : ("full" as const) } : {}),
  }
}
