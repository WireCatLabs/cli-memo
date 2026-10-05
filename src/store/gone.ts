import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"

const PAGE = 500
const MAX_DELETED_SHARE = 0.2
const MIN_DELETIONS_CAPPED = 5

export interface Gone {
  deleted: number
  /** Why stored entries missing at the source were left alone, when they were. */
  skipped?: string
}

/**
 * What the store holds of this account, from `since` on, and the source no longer lists, was deleted
 * there: its text goes. Wrongly dropping text cannot be undone and a missed deletion is caught on the
 * next run, so an unusually large share missing is refused rather than applied — an unmounted folder or
 * a half-answered listing looks exactly like that.
 */
export const dropMissing = async (
  store: MessageStore,
  key: AccountKey,
  present: Set<string>,
  since?: string,
): Promise<Gone> => {
  const stored: { chatId: string; id: string }[] = []
  for (let offset = 0; ; offset += PAGE) {
    const chats = await store.chats(key, { limit: PAGE, offset })
    for (const chat of chats.items) {
      if (since !== undefined && chat.lastMessageAt !== null && chat.lastMessageAt < since) continue
      for (let before: string | undefined; ; ) {
        const page = await store.messages(key, chat.id, {
          limit: PAGE,
          ...(since === undefined ? {} : { since }),
          ...(before === undefined ? {} : { before }),
        })
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
      skipped: `${gone.length} of ${stored.length} stored entries are missing at the source — too many to trust; nothing deleted`,
    }
  const byChat = new Map<string, string[]>()
  for (const { chatId, id } of gone) byChat.set(chatId, [...(byChat.get(chatId) ?? []), id])
  let deleted = 0
  for (const [chatId, ids] of byChat) deleted += await store.markDeleted(key, ids, { chatId })
  return { deleted }
}
