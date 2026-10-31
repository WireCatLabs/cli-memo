import type { MailHeaders, MailSource } from "@wirecat/cli-core/mail"
import { ENVELOPE, GMAIL_ALL_MAIL } from "@wirecat/cli-core/mail"
import type { AccountKey, MessageStore, ThreadSave } from "@wirecat/cli-core/store"
import { pause, slicesOf } from "./slices.js"

const STATE = "mail_headers_backfill"
/** Emails read per sync: about 4 MB of headers, so a timer run stays short and the backlog clears in hours. */
export const HEADERS_PER_RUN = 2000

interface Progress {
  done: boolean
  /** Received time of the oldest email already looked at; the next run takes older ones. */
  before?: number
}

const storedOf = (headers: MailHeaders): Record<string, string | boolean> => ({
  ...(headers.listId ? { "list-id": headers.listId } : {}),
  ...(headers.replyTo === undefined ? {} : { "reply-to": headers.replyTo }),
  ...headers.auth,
})

/**
 * Mail stored in full before memo kept Reply-To and Gmail's SPF, DKIM and DMARC verdicts (October 2026) gets them
 * from Gmail, header lines only, newest first and HEADERS_PER_RUN per sync, so the sender score can use them.
 * Answers how many emails got headers, or undefined when there is nothing left to do.
 */
export const backfillHeaders = async (
  store: MessageStore,
  source: MailSource,
  address: string,
  now = Date.now(),
): Promise<number | undefined> => {
  if (source.find === undefined) return undefined
  const key: AccountKey = { provider: "email", account: address.toLowerCase() }
  const saved = (await store.sync.syncState(key, STATE))?.value
  const progress: Progress = saved === undefined ? { done: false } : (JSON.parse(saved) as Progress)
  if (progress.done) return undefined
  const stored = await store.accounts.storedAccount(key).catch(() => null)
  if (stored === null) return undefined
  const before = progress.before ?? Number.POSITIVE_INFINITY
  const batch = (await store.mail.emailFacts({ accountId: stored.id }))
    .filter(
      (email) =>
        email.dkim === null &&
        email.dmarc === null &&
        email.replyTo === null &&
        (email.receivedAt ?? 0) < before &&
        !email.mailboxes.some(({ kind }) => kind === ENVELOPE),
    )
    .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0))
    .slice(0, HEADERS_PER_RUN)
  if (batch.length === 0) {
    await store.sync.setSyncState(key, STATE, JSON.stringify({ ...progress, done: true }))
    return undefined
  }
  const all = (await source.folders?.().catch(() => undefined))?.all ?? GMAIL_ALL_MAIL
  const found = new Map(
    (
      await source.find(
        batch.map(({ externalId }) => externalId),
        all,
        { headers: true },
      )
    ).map((item) => [item.messageId, item]),
  )
  let filled = 0
  const slices = slicesOf(batch)
  for (const [at, slice] of slices.entries()) {
    const inputs: ThreadSave[] = []
    for (const { externalId } of slice) {
      const headers = found.get(externalId)?.headers
      if (headers === undefined) continue
      const record = storedOf(headers)
      const email = await store.mail.email(stored.id, externalId)
      // Headers already kept, even without a verdict, stay as the import wrote them.
      if (email === null || email.bodyText === null || Object.keys(email.headers ?? {}).length) continue
      if (Object.keys(record).length === 0) continue
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
            bodyText: email.bodyText,
            headers: record,
          },
        ],
      })
    }
    const value = JSON.stringify({ done: false, before: slice.at(-1)?.receivedAt ?? 0 })
    await store.mail.saveThreads(inputs, [{ accountId: stored.id, name: STATE, value }])
    filled += inputs.length
    if (at < slices.length - 1) await pause()
  }
  return filled
}
