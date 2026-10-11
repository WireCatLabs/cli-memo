import { extractText, importEngine, type LoadEngine } from "@wirecat/cli-messaging/documents"
import type { AccountKey, AttachmentInput, EmailAddress, MessageStore } from "@wirecat/cli-messaging/store"
import { embedChanged, embedMailChunks, type NotesEmbedded } from "../notes/embed.js"
import { dropMissing, tooManyGone } from "../store/gone.js"
import { listAllMail, listImapMail } from "./gmail.js"
import type { Himalaya } from "./himalaya.js"
import { type Address, parseMail } from "./parse.js"

export interface MailAccount {
  /** The account's name in Himalaya's config. */
  name: string
  /** The mailbox address: the store's account id. */
  address: string
  mode?: "gmail" | "imap"
  folders?: string[]
  embed?: boolean
}

export interface ImportResult {
  account: string
  since: string
  listed: number
  saved: number
  alreadyStored: number
  deleted: number
  /** False when `max` stopped the run before every new message was read; the next run continues. */
  complete: boolean
  /** Why stored messages missing at the source were left alone, when they were. */
  deletionsSkipped?: string
  indexed?: NotesEmbedded
  coverage?: { folders: string[]; since: string; until: string; state: "window" | "partial"; identity: string }
  attachments?: { message: string; part: number; status: string }[]
}

const DAY = 86_400_000
/** IMAP's SINCE counts whole days in the server's zone, so the window's first days are not trusted. */
const EDGE = 2 * DAY
const MAX_ATTACHMENT_TEXT = 200_000

const addressOf = ({ email, name }: Address): EmailAddress => ({ address: email, name })

export const importMail = async ({
  store,
  run,
  account,
  since,
  max = 200,
  now = Date.now,
  env,
  embed = false,
  loadEngine = importEngine,
  retryAttachments = false,
  indexThreads = embedChanged,
  embedMail = embedMailChunks,
}: {
  store: MessageStore
  run: Himalaya
  account: MailAccount
  since: Date
  max?: number
  now?: () => number
  env?: NodeJS.ProcessEnv
  embed?: boolean
  loadEngine?: LoadEngine
  retryAttachments?: boolean
  indexThreads?: typeof embedChanged
  embedMail?: typeof embedMailChunks
}): Promise<ImportResult> => {
  const startedAt = now()
  const key: AccountKey = { provider: "email", account: account.address.toLowerCase() }
  const accountId = await store.saveAccount(key, { name: account.address })

  const folders = account.folders ?? [account.mode === "imap" ? "INBOX" : "[Gmail]/All Mail"]
  if (folders.length < 1 || folders.length > 50) throw new Error("select 1–50 mail folders")
  const collected = []
  for (const folder of folders)
    collected.push(
      ...(account.mode === "imap"
        ? await listImapMail(run, account.name, since, folder)
        : (await listAllMail(run, account.name, since, folder)).map((item) => ({
            ...item,
            folder: folder === "[Gmail]/All Mail" ? "archive" : folder,
            scopeFolder: folder,
          }))),
    )
  const listed = [...new Map(collected.map((item) => [item.messageId, item])).values()].sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt),
  )
  const present = new Set(listed.map(({ messageId }) => messageId))
  const foundFolders = new Map<string, Set<string>>()
  for (const item of collected) {
    const current = foundFolders.get(item.messageId) ?? new Set<string>()
    current.add(item.scopeFolder ?? item.folder ?? (folders[0] as string))
    foundFolders.set(item.messageId, current)
  }
  const mailbox = (folder: string) => ({ externalId: folder, name: folder, kind: null })
  const label = (name: string) => ({ externalId: `label:${name}`, name, kind: "label" })
  const labelsOf = new Map(collected.flatMap((item) => (item.labels === undefined ? [] : [[item.messageId, item]])))
  const allMailOnly = account.mode !== "imap" && folders.length === 1 && folders[0] === "[Gmail]/All Mail"

  // Deletions are proved against the mailboxes as stored before this scan moves anything.
  const scope = JSON.stringify({ mode: account.mode ?? "gmail", folders: [...folders].sort() })
  const previousScope = await store.syncState(key, "mail_folder_scope")
  const windowStart = new Date(since.getTime() + EDGE)
  let deleted = 0
  let skipped: string | undefined
  if (previousScope !== undefined && previousScope.value !== scope)
    skipped = "folder scope changed; missing mail is not proven deleted"
  else {
    // A label is not where mail lives, so only folders prove that a missing mail was deleted.
    const candidates = (await store.mail.emails({ accountId, since: windowStart.getTime() })).filter(
      ({ mailboxes }) => {
        const inFolders = mailboxes.filter(({ kind }) => kind !== "label")
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
  await store.mail.setMailboxes(
    accountId,
    folders.map(mailbox),
    new Map([...foundFolders].map(([id, found]) => [id, [...found]])),
    startedAt,
  )
  // A message's label list is whole, so every label the account has is replaced for each message read.
  if (labelsOf.size) {
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
  let saved = 0
  let alreadyStored = 0
  let read = 0
  for (const item of listed) {
    if (!retryAttachments && (await store.mail.email(accountId, item.messageId)) !== null) {
      alreadyStored++
      continue
    }
    if (read >= max) break
    read++
    const mail = parseMail(
      await run(["--json", "message", "read", "-a", account.name, "-m", item.folder ?? "archive", item.uid]),
    )
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
        text: extracted ? extracted.text.slice(0, MAX_ATTACHMENT_TEXT) : null,
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
          outgoing: mail.from === null ? null : mail.from.email === key.account,
          mailboxes: [
            ...[...(foundFolders.get(item.messageId) ?? [])].map(mailbox),
            ...(labelsOf.get(item.messageId)?.labels ?? []).map(label),
          ],
          ...(labelsOf.get(item.messageId)?.seen === undefined
            ? {}
            : { read: labelsOf.get(item.messageId)?.seen ?? null }),
          ...(labelsOf.get(item.messageId)?.flagged === undefined
            ? {}
            : { flagged: labelsOf.get(item.messageId)?.flagged ?? null }),
          attachments: files,
        },
      ],
    })
    saved++
  }

  const complete = listed.length - alreadyStored - saved === 0
  await store.setSyncState(key, "mail_folder_scope", scope)
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
  await store.setSyncState(key, "mail_coverage", JSON.stringify(coverage))
  return {
    account: key.account,
    since: since.toISOString(),
    listed: listed.length,
    saved,
    alreadyStored,
    deleted,
    complete,
    indexed,
    coverage,
    ...(attachments.length ? { attachments } : {}),
    ...(skipped === undefined ? {} : { deletionsSkipped: skipped }),
  }
}
