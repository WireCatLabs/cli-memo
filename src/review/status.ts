import { mailTurn, marksOf, OWED_DAYS } from "@wirecat/cli-core/mail"
import { markItem } from "@wirecat/cli-core/mail/cli"
import type { ProposalFilter } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { reviewRegistry } from "./kinds.js"

/** Pages read to count proposals; past them the count says "at least". */
const MOST_PAGES = 10

export const counted = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  filter: Omit<ProposalFilter, "limit" | "offset">,
  since?: number,
) => {
  const registry = reviewRegistry(store)
  const byKind: Record<string, number> = {}
  let total = 0
  for (let page = 0; page < MOST_PAGES; page++) {
    const found = await registry.list({ ...filter, limit: 50, offset: page * 50 })
    const fresh = since === undefined ? found.items : found.items.filter((row) => Date.parse(row.createdAt) >= since)
    for (const row of fresh) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1
    total += fresh.length
    if (!found.hasMore || fresh.length < found.items.length) return { total, byKind, complete: true }
  }
  return { total, byKind, complete: false }
}

/** How many proposals wait for the owner about these references: as subject, linked object or project. */
export const waitingAbout = async (store: MessageStore, env: NodeJS.ProcessEnv, refs: readonly string[]) => {
  const wanted = new Set(refs)
  const registry = reviewRegistry(store)
  let count = 0
  for (let page = 0; page < MOST_PAGES; page++) {
    const found = await registry.list({ status: "proposed", limit: 50, offset: page * 50 })
    count += found.items.filter((row) =>
      [row.subject, row.object, row.project].some((ref) => ref !== null && wanted.has(ref)),
    ).length
    if (!found.hasMore) return { count, complete: true }
  }
  return { count, complete: false }
}

/**
 * The owner's morning look, with no model call: per mail account the threads with new mail since `since`, what
 * is owed and waiting now, and how far each agent has processed it; then what was proposed since, and what waits.
 */
export const reviewStatus = async (store: MessageStore, env: NodeJS.ProcessEnv, since: number, now = Date.now()) => {
  const mail = []
  for (const key of (await store.accounts.accounts()).filter((one) => one.provider === "email")) {
    const stored = await store.accounts.storedAccount(key)
    const turns = (await store.mail.threadActivity(stored.id, now - OWED_DAYS * 86_400_000)).map((thread) => ({
      at: thread.lastEmailAt,
      turn: mailTurn(thread.newest),
    }))
    mail.push({
      account: `${key.provider}:${key.account}`,
      threads: turns.filter((one) => one.at > since).length,
      owed: turns.filter((one) => one.turn === "owed").length,
      waiting: turns.filter((one) => one.turn === "waiting").length,
      coverage: (await marksOf(store, key)).map(markItem),
    })
  }
  const proposed = await counted(store, env, { status: "all" }, since)
  const pending = await counted(store, env, { status: "proposed" })
  return {
    since: new Date(since).toISOString(),
    at: new Date(now).toISOString(),
    mail,
    proposed: { count: proposed.total, kinds: proposed.byKind, complete: proposed.complete },
    waiting: { count: pending.total, kinds: pending.byKind, complete: pending.complete },
    quiet:
      proposed.total === 0 &&
      pending.total === 0 &&
      mail.every((one) => one.threads === 0 && one.owed === 0 && one.waiting === 0),
  }
}

export type ReviewStatus = Awaited<ReturnType<typeof reviewStatus>>

const kindsText = (kinds: Record<string, number>) =>
  Object.entries(kinds)
    .sort(([, a], [, b]) => b - a)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ")

const atLeast = (count: number, complete: boolean) => `${count}${complete ? "" : "+"}`

export const reviewStatusText = (status: ReviewStatus): string => {
  const since = status.since.slice(0, 16).replace("T", " ")
  if (status.quiet) return `nothing came in, nothing was proposed and nothing waits since ${since}`
  return [
    `since ${since}`,
    ...status.mail.map(
      (one) =>
        `${one.account}  ${one.threads} thread${one.threads === 1 ? "" : "s"} with new mail · owed ${one.owed} · ` +
        `waiting ${one.waiting} (last ${OWED_DAYS} days)`,
    ),
    ...status.mail.flatMap((one) =>
      one.coverage.length === 0
        ? [`  ${one.account}: no agent has a processing mark`]
        : one.coverage.map(
            (mark) =>
              `  ${one.account}: ${mark.holder} through ${mark.through_received_at ?? mark.through_id}, ` +
              `read ${mark.read}, held ${mark.held}`,
          ),
    ),
    `proposed  ${atLeast(status.proposed.count, status.proposed.complete)}${
      status.proposed.count ? `: ${kindsText(status.proposed.kinds)}` : ""
    }`,
    `waiting   ${atLeast(status.waiting.count, status.waiting.complete)}${
      status.waiting.count ? `: ${kindsText(status.waiting.kinds)} — memo review` : ""
    }`,
  ].join("\n")
}
