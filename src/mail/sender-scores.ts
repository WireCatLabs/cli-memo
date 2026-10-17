import type { AccountKey, MessageStore, SenderScore } from "@wirecat/cli-core/store"
import { knownAges, type LookupResult, lookUpAges } from "./domain-age.js"
import { domainsToAge, groupKey, probeMail } from "./probe.js"
import { FREE_MAIL } from "./score.js"
import { listedOf } from "./trash.js"

const SCORED = "mail_sender_scores"
/** Raised when the weights or the signals change, so every sender is scored again on the next sync. */
export const SCORE_VERSION = 3
const DAY = 86_400_000
/** Only senders heard from this recently are looked up: an older sender's domain may have lapsed or changed hands. */
const RECENT = 2 * 365 * DAY

/**
 * Scores every sender of the account from the mail the store holds, as `memo mail inspect` scores a listing, and
 * keeps the scores in the store, where search shows them. At most once a day, or at once after SCORE_VERSION
 * changes. A sender in several groups (its own mail and a list) keeps the highest score. Domains not yet aged are
 * looked up first, for senders heard from in the last two years.
 */
export const scoreSenders = async (
  store: MessageStore,
  address: string,
  env: NodeJS.ProcessEnv,
  now = Date.now(),
  lookUp: (env: NodeJS.ProcessEnv, domains: readonly string[]) => Promise<LookupResult> = lookUpAges,
): Promise<{ scored: number; looked: number; failed: number } | undefined> => {
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
  // Each registry learns only its own domains' names; big mailbox providers and senders the owner wrote to are never asked.
  const latest = new Map<string, string>()
  for (const item of items) {
    if (item.headers === undefined) continue
    const key = groupKey(item.headers)
    if ((latest.get(key) ?? "") < item.receivedAt) latest.set(key, item.receivedAt)
  }
  const since = new Date(now - RECENT).toISOString()
  const recent = probeMail(items, Number.MAX_SAFE_INTEGER).items.filter(
    (group) =>
      (latest.get(
        groupKey({
          ...(group.from === null ? {} : { from: group.from }),
          ...(group.listId === null ? {} : { listId: group.listId }),
        }),
      ) ?? "") >= since,
  )
  const lookups = await lookUp(env, domainsToAge(recent, FREE_MAIL)).catch(() => ({ looked: 0, failed: 1 }))
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
  return { scored: written, ...lookups }
}
