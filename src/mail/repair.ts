import { ENVELOPE, htmlToText, looksLikeHtml } from "@wirecat/cli-core/mail"
import type { AccountKey, MessageStore, ThreadSave } from "@wirecat/cli-core/store"
import { pause, slicesOf } from "./slices.js"

const REPAIRED = "mail_text_repair"
const VERSION = "html-text-1"

/**
 * Once per account: email text saved before memo read an HTML text/plain part as HTML is converted in place, from
 * what the store holds. Runs inside sync, saving 50 emails per transaction so other CLIs are not locked out.
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
  const refs = (await store.mail.emailRefs({ accountId: stored.id })).filter(
    ({ deleted, mailboxes }) => !deleted && !mailboxes.some(({ kind }) => kind === ENVELOPE),
  )
  let repaired = 0
  const slices = slicesOf(refs)
  for (const [at, slice] of slices.entries()) {
    const inputs: ThreadSave[] = []
    for (const { externalId } of slice) {
      const email = await store.mail.email(stored.id, externalId)
      if (email === null || !email.bodyText || !looksLikeHtml(email.bodyText)) continue
      const [placed] = await store.mail.inThreads(stored.id, [externalId])
      if (placed === undefined) continue
      inputs.push({
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
    }
    const last = at === slices.length - 1
    // A converted email no longer looks like HTML, so a run cut short skips what earlier slices saved.
    await store.mail.saveThreads(inputs, last ? [{ accountId: stored.id, name: REPAIRED, value: VERSION }] : undefined)
    repaired += inputs.length
    if (!last) await pause()
  }
  if (slices.length === 0) await store.sync.setSyncState(key, REPAIRED, VERSION)
  return repaired
}
