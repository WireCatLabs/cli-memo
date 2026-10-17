import type { AccountKey, MessageStore, SenderScore } from "@wirecat/cli-core/store"
import { knownAges } from "./domain-age.js"
import { groupKey, probeMail } from "./probe.js"
import { listedOf } from "./trash.js"

const SCORED = "mail_sender_scores"
/** Raised when the weights or the signals change, so every sender is scored again on the next sync. */
export const SCORE_VERSION = 2
const DAY = 86_400_000

/**
 * Scores every sender of the account from the mail the store holds, as `memo mail inspect` scores a listing, and
 * keeps the scores in the store, where search shows them. At most once a day, or at once after SCORE_VERSION
 * changes. A sender in several groups (its own mail and a list) keeps the highest score.
 */
export const scoreSenders = async (
  store: MessageStore,
  address: string,
  env: NodeJS.ProcessEnv,
  now = Date.now(),
): Promise<number | undefined> => {
  const key: AccountKey = { provider: "email", account: address.toLowerCase() }
  const last = (await store.sync.syncState(key, SCORED))?.value
  const done = last === undefined ? undefined : (JSON.parse(last) as { version: number; at: number })
  if (done !== undefined && done.version === SCORE_VERSION && now - done.at < DAY) return undefined
  const stored = await store.accounts.storedAccount(key).catch(() => null)
  if (stored === null) return undefined
  const items = (await store.mail.emailFacts({ accountId: stored.id })).map((email) => {
    const item = listedOf(email)
    return email.outgoing && !item.labels?.includes("Sent")
      ? { ...item, labels: [...(item.labels ?? []), "Sent"] }
      : item
  })
  const groups = new Map(
    probeMail(items, Number.MAX_SAFE_INTEGER, knownAges(env)).items.map((group) => [
      groupKey({
        ...(group.from === null ? {} : { from: group.from }),
        ...(group.listId === null ? {} : { listId: group.listId }),
      }),
      group,
    ]),
  )
  const scores = new Map<string, SenderScore>()
  for (const item of items) {
    const from = item.headers?.from?.toLowerCase()
    const group = item.headers === undefined ? undefined : groups.get(groupKey(item.headers))
    if (from === undefined || group === undefined) continue
    const held = scores.get(from)
    if (held === undefined || group.score > held.score)
      scores.set(from, { address: from, score: group.score, signals: group.signals })
  }
  const written = await store.mail.setSenderScores(stored.id, [...scores.values()], now)
  await store.sync.setSyncState(key, SCORED, JSON.stringify({ version: SCORE_VERSION, at: now }))
  return written
}
