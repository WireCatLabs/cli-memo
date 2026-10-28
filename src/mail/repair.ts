import { ENVELOPE, htmlToText, looksLikeHtml } from "@wirecat/cli-core/mail"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"

const REPAIRED = "mail_text_repair"
const VERSION = "html-text-1"

/**
 * Once per account: email text saved before memo read an HTML text/plain part as HTML is converted in place, from
 * what the store holds. Runs inside sync, so it holds the import lock like any other write.
 */
export const repairHtmlText = async (
  store: MessageStore,
  address: string,
  now = Date.now(),
): Promise<number | undefined> => {
  const key: AccountKey = { provider: "email", account: address.toLowerCase() }
  if ((await store.sync.syncState(key, REPAIRED))?.value === VERSION) return undefined
  const stored = await store.accounts.storedAccount(key).catch(() => null)
  if (stored === null) return undefined
  let repaired = 0
  for (const { externalId, deleted, mailboxes } of await store.mail.emailRefs({ accountId: stored.id })) {
    if (deleted || mailboxes.some(({ kind }) => kind === ENVELOPE)) continue
    const email = await store.mail.email(stored.id, externalId)
    if (email === null || !email.bodyText || !looksLikeHtml(email.bodyText)) continue
    const [placed] = await store.mail.inThreads(stored.id, [externalId])
    if (placed === undefined) continue
    await store.mail.saveThread({
      accountId: stored.id,
      externalId: placed.threadExternalId,
      now,
      emails: [
        {
          externalId,
          subject: email.subject,
          from: email.fromAddress === null ? null : { address: email.fromAddress, name: email.fromName },
          sentAt: email.sentAt,
          bodyText: htmlToText(email.bodyText),
        },
      ],
    })
    repaired++
  }
  await store.sync.setSyncState(key, REPAIRED, VERSION)
  return repaired
}
