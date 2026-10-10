import type { Message } from "@wirecat/cli-messaging"
import { extractText, importEngine, type LoadEngine } from "@wirecat/cli-messaging/documents"
import type { AccountKey, MessageStore } from "@wirecat/cli-messaging/store"
import { embedChanged, type NotesEmbedded } from "../notes/embed.js"
import { dropMissing } from "../store/gone.js"
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
  attachments?: { message: string; part: number; status: string; locatorId?: string }[]
}

const DAY = 86_400_000
/** IMAP's SINCE counts whole days in the server's zone, so the window's first days are not trusted. */
const EDGE = 2 * DAY
const ANY = /[\s\S]?/

const titleOf = (subject: string | null): string | null =>
  subject?.replace(/^\s*((re|fwd?|aw|wg)\s*:\s*)+/i, "").trim() || null

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
}): Promise<ImportResult> => {
  const startedAt = now()
  const key: AccountKey = { provider: "email", account: account.address.toLowerCase() }
  await store.saveAccount(key, { name: account.address })

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
  const changed = new Set<string>()
  const attachments: NonNullable<ImportResult["attachments"]> = []
  const present = new Set(listed.map(({ messageId }) => messageId))
  const foundFolders = new Map<string, Set<string>>()
  for (const item of collected) {
    const current = foundFolders.get(item.messageId) ?? new Set<string>()
    current.add(item.scopeFolder ?? item.folder ?? (folders[0] as string))
    foundFolders.set(item.messageId, current)
  }
  for (const [id, found] of foundFolders) {
    const earlier = await store.syncState(key, `mail_message_folders:${id}`)
    const kept =
      earlier === undefined ? [] : (JSON.parse(earlier.value) as string[]).filter((folder) => !folders.includes(folder))
    await store.setSyncState(key, `mail_message_folders:${id}`, JSON.stringify([...new Set([...kept, ...found])]))
  }

  let saved = 0
  let alreadyStored = 0
  let read = 0
  for (const item of listed) {
    if (!retryAttachments && (await store.message(key, item.messageId, { chatId: item.threadId })) !== undefined) {
      const children = await store.syncState(key, `mail_attachments:${item.messageId}`)
      for (const id of children === undefined ? [] : (JSON.parse(children.value) as string[])) present.add(id)
      alreadyStored++
      continue
    }
    if (read >= max) break
    read++
    const mail = parseMail(
      await run(["--json", "message", "read", "-a", account.name, "-m", item.folder ?? "archive", item.uid]),
    )
    const people = [mail.from, ...mail.to, ...mail.bcc].filter((person): person is Address => person !== null)
    const known = (await store.members(key, item.threadId)).map(({ id }) => id)
    const members = [...new Set([...known, ...people.map(({ email }) => email)])]
    const newest = (await store.find({ account: key, chatId: item.threadId, pattern: ANY, limit: 1 })).items[0]
      ?.timestamp
    // Saving a chat replaces its fields, so an older message read later must not move the time back.
    const lastMessageAt = newest !== undefined && newest > item.receivedAt ? newest : item.receivedAt
    await store.applyDelta(key, {
      chats: [
        {
          id: item.threadId,
          title: titleOf(mail.subject),
          kind: members.length > 2 ? "group" : "dialog",
          unreadCount: null,
          lastMessageAt,
          participantsCount: members.length,
        },
      ],
      people: people.map(({ email, name }) => ({ id: email, name })),
      members: new Map([[item.threadId, members]]),
    })
    const message: Message = {
      id: item.messageId,
      chatId: item.threadId,
      senderId: mail.from?.email ?? null,
      senderName: mail.from?.name ?? null,
      timestamp: item.receivedAt,
      editedAt: null,
      text: [mail.subject, mail.text].filter(Boolean).join("\n\n"),
      outgoing: mail.from === null ? null : mail.from.email === key.account,
      attachments: mail.attachments.map((part) => ({
        kind: "file",
        name: part.name,
        ...(part.mime === null ? {} : { mime: part.mime }),
        ...(part.bytes === null ? {} : { size: part.bytes.byteLength }),
        providerRef: { message: item.messageId, part: part.id },
      })),
      providerMetadata: {
        emailHeaders: { cc: mail.cc.map((address) => address.email), bcc: mail.bcc.map((address) => address.email) },
      },
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
    await store.saveMessages(key, item.threadId, [message], { via: "himalaya", seenAt: startedAt })
    const children: string[] = []
    for (const part of mail.attachments) {
      const extraction =
        part.bytes === null
          ? { status: "unavailable" as const }
          : await extractText(
              part.bytes,
              { kind: "file", name: part.name, mime: part.mime, path: part.name },
              loadEngine,
            )
      if (extraction.status !== "extracted") {
        attachments.push({ message: item.messageId, part: part.id, status: extraction.status })
        continue
      }
      const id = `${item.messageId}:attachment:${part.id}`
      await store.saveMessages(
        key,
        item.threadId,
        [
          {
            ...message,
            id,
            text: `${part.name}\n\n${extraction.text}`.slice(0, 200_000),
            attachments: [],
            providerMetadata: {
              emailAttachment: { message: item.messageId, part: part.id, extractor: extraction.extractor },
            },
          },
        ],
        { via: "himalaya", seenAt: startedAt },
      )
      children.push(id)
      present.add(id)
      attachments.push({ message: item.messageId, part: part.id, status: "extracted", locatorId: id })
    }
    await store.setSyncState(key, `mail_attachments:${item.messageId}`, JSON.stringify(children))
    saved++
    changed.add(item.threadId)
  }

  const complete = listed.length - alreadyStored - saved === 0
  const scope = JSON.stringify({ mode: account.mode ?? "gmail", folders: [...folders].sort() })
  const previousScope = await store.syncState(key, "mail_folder_scope")
  const { deleted, skipped } =
    previousScope !== undefined && previousScope.value !== scope
      ? { deleted: 0, skipped: "folder scope changed; missing mail is not proven deleted" }
      : await dropMissing(store, key, present, new Date(since.getTime() + EDGE).toISOString(), async ({ id }) => {
          const parent = id.replace(/:attachment:\d+$/, "")
          const membership = await store.syncState(key, `mail_message_folders:${parent}`)
          if (membership === undefined)
            return account.mode !== "imap" && folders.length === 1 && folders[0] === "[Gmail]/All Mail"
          return (JSON.parse(membership.value) as string[]).every((folder) => folders.includes(folder))
        })
  await store.setSyncState(key, "mail_folder_scope", scope)
  const indexed = await indexThreads(store, key, [...changed], {
    embed: embed && account.embed !== false,
    ...(env === undefined ? {} : { env }),
  })
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
