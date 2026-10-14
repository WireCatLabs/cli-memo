import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"

export interface HeldMessage {
  text: string
  senderId: string | null
  senderName: string | null
  timestamp: string
}

/**
 * A live message, or a live email of the mail tables, by the ids its locator holds. Mail an import before 0.8.0
 * saved as messages is a message.
 */
export const heldMessage = async (
  store: MessageStore,
  key: AccountKey,
  id: string,
  chatId: string,
): Promise<HeldMessage | undefined> => {
  if (key.provider === "email") {
    const account = await store.storedAccount(key).catch(() => undefined)
    const email = account ? await store.mail.email(account.id, id) : null
    if (email)
      return email.deletedAt === null
        ? {
            text: [email.subject, email.bodyText].filter(Boolean).join("\n\n"),
            senderId: email.fromAddress,
            senderName: email.fromName,
            timestamp: new Date(email.sentAt ?? email.receivedAt ?? email.createdAt).toISOString(),
          }
        : undefined
  }
  return store.message(key, id, { chatId })
}
