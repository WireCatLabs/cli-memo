import type { Message } from "@leemour/cli-messaging"
import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"
import { listAllMail } from "./gmail.js"
import type { Himalaya } from "./himalaya.js"
import { type Address, parseMail } from "./parse.js"

export interface MailAccount {
  /** The account's name in Himalaya's config. */
  name: string
  /** The mailbox address: the store's account id. */
  address: string
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
}

const DAY = 86_400_000
/** IMAP's SINCE counts whole days in the server's zone, so the window's first days are not trusted. */
const EDGE = 2 * DAY
const MAX_DELETED_SHARE = 0.2
const MIN_DELETIONS_CAPPED = 5
const ANY = /[\s\S]?/
const PAGE = 500

const titleOf = (subject: string | null): string | null =>
  subject?.replace(/^\s*((re|fwd?|aw|wg)\s*:\s*)+/i, "").trim() || null

export const importMail = async ({
  store,
  run,
  account,
  since,
  max = 200,
  now = Date.now,
}: {
  store: MessageStore
  run: Himalaya
  account: MailAccount
  since: Date
  max?: number
  now?: () => number
}): Promise<ImportResult> => {
  const startedAt = now()
  const key: AccountKey = { provider: "email", account: account.address.toLowerCase() }
  await store.saveAccount(key, { name: account.address })

  const listed = (await listAllMail(run, account.name, since)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  const present = new Set(listed.map(({ messageId }) => messageId))

  let saved = 0
  let alreadyStored = 0
  let read = 0
  for (const item of listed) {
    if ((await store.message(key, item.messageId, { chatId: item.threadId })) !== undefined) {
      alreadyStored++
      continue
    }
    if (read >= max) break
    read++
    const mail = parseMail(await run(["--json", "message", "read", "-a", account.name, "-m", "archive", item.uid]))
    const people = [mail.from, ...mail.to].filter((person): person is Address => person !== null)
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
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
    await store.saveMessages(key, item.threadId, [message], { via: "himalaya", seenAt: startedAt })
    saved++
  }

  const complete = listed.length - alreadyStored - saved === 0
  const { deleted, skipped } = await markGone(store, key, since, present)
  return {
    account: key.account,
    since: since.toISOString(),
    listed: listed.length,
    saved,
    alreadyStored,
    deleted,
    complete,
    ...(skipped === undefined ? {} : { deletionsSkipped: skipped }),
  }
}

/**
 * A message the store holds from inside the window, and the source no longer lists, was deleted there:
 * its text goes. Wrongly dropping text cannot be undone and a missed deletion is caught next run, so
 * the window's edge is left alone, and an unusually large share is refused rather than applied.
 */
const markGone = async (
  store: MessageStore,
  key: AccountKey,
  since: Date,
  present: Set<string>,
): Promise<{ deleted: number; skipped?: string }> => {
  const trusted = new Date(since.getTime() + EDGE).toISOString()
  const stored: { chatId: string; id: string }[] = []
  for (let offset = 0; ; offset += PAGE) {
    const chats = await store.chats(key, { limit: PAGE, offset })
    for (const chat of chats.items) {
      if (chat.lastMessageAt !== null && chat.lastMessageAt < trusted) continue
      for (let before: string | undefined; ; ) {
        const page = await store.messages(key, chat.id, { limit: PAGE, since: trusted, ...(before ? { before } : {}) })
        stored.push(...page.items.map(({ id }) => ({ chatId: chat.id, id })))
        before = page.items[0]?.id
        if (!page.hasMore || before === undefined) break
      }
    }
    if (!chats.hasMore) break
  }
  const gone = stored.filter(({ id }) => !present.has(id))
  if (gone.length === 0) return { deleted: 0 }
  if (gone.length >= MIN_DELETIONS_CAPPED && gone.length > stored.length * MAX_DELETED_SHARE)
    return {
      deleted: 0,
      skipped: `${gone.length} of ${stored.length} stored messages are missing at the source — too many to trust; nothing deleted`,
    }
  const byChat = new Map<string, string[]>()
  for (const { chatId, id } of gone) byChat.set(chatId, [...(byChat.get(chatId) ?? []), id])
  let deleted = 0
  for (const [chatId, ids] of byChat) deleted += await store.markDeleted(key, ids, { chatId })
  return { deleted }
}
