import { CliError } from "@wirecat/cli-base"
import { type GroupGuard, groupGuardOf, lockedRegistry, proposalRegistry } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { reviewRegistry } from "../review/kinds.js"
import { groupScopeOf } from "./group.js"

/** cli-core's guard for a run under MEMO_GROUP_LOCK; `undefined` when the run is not locked (WC-ACCT-13). */
export const guardOf = (store: MessageStore, env: NodeJS.ProcessEnv): Promise<GroupGuard | undefined> =>
  groupGuardOf(store, APP, env)

/** The review list a run decides through: under the lock a proposal outside the group is not listed nor decided. */
export const reviewOf = async (store: MessageStore, env: NodeJS.ProcessEnv) => {
  const guard = await guardOf(store, env)
  return guard === undefined ? reviewRegistry(store) : lockedRegistry(reviewRegistry(store), guard)
}

/** The proposals a run decides through, not only the review's: under the lock the same limits hold. */
export const proposalsOf = async (store: MessageStore, env: NodeJS.ProcessEnv) => {
  const guard = await guardOf(store, env)
  return guard === undefined ? proposalRegistry(store) : lockedRegistry(proposalRegistry(store), guard)
}

/** An answer with every outside reference taken out of its `evidence`, and how many, under the lock. */
export const stripped = async <T>(store: MessageStore, env: NodeJS.ProcessEnv, value: T): Promise<T> => {
  const guard = await guardOf(store, env)
  if (guard === undefined) return value
  const { value: kept, out_of_scope } = await guard.strip(value)
  return out_of_scope > 0 && kept !== null && typeof kept === "object" && !Array.isArray(kept)
    ? ({ ...kept, out_of_scope } as T)
    : kept
}

/** The sources read back for a memory or a fact, under the lock only the group's, and how many were left out. */
export const sourcesIn = async <T extends { ref: string | null }>(
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  sources: readonly T[],
): Promise<{ sources: T[]; out_of_scope?: number }> => {
  const guard = await guardOf(store, env)
  if (guard === undefined) return { sources: [...sources] }
  const kept: T[] = []
  for (const one of sources) if (one.ref === null || (await guard.visible(one.ref))) kept.push(one)
  return { sources: kept, ...(kept.length < sources.length ? { out_of_scope: sources.length - kept.length } : {}) }
}

type NotRead = { source: string; reason: string }

/**
 * Under the lock, a context's `notRead` would name every account kept out, which tells the agent they exist: those
 * become one line with their count. Sources that are no account of the store (`notes`, `events`) stay as they are.
 */
export const lockedCoverage = async <T>(store: MessageStore, env: NodeJS.ProcessEnv, value: T): Promise<T> => {
  const guard = await guardOf(store, env)
  const scope = guard === undefined ? undefined : await groupScopeOf(store, env)
  if (guard === undefined || scope === undefined) return value
  const held = new Set((await store.accounts.storedAccounts()).map(({ provider, account }) => `${provider}:${account}`))
  const outside = (source: string) =>
    held.has(source) && !scope.accounts.some((key) => `${key.provider}:${key.account}` === source)
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (node === null || typeof node !== "object") return node
    return Object.fromEntries(
      Object.entries(node).map(([key, inner]) => {
        if (key !== "notRead" || !Array.isArray(inner)) return [key, walk(inner)]
        const rows = inner as NotRead[]
        const away = rows.filter((one) => outside(one.source)).length
        const kept = rows.filter((one) => !outside(one.source))
        return [
          key,
          away ? [...kept, { source: "other accounts", reason: `${away} outside group ${guard.group}` }] : kept,
        ]
      }),
    )
  }
  return walk(value) as T
}

/** Refuses a proposed action outside the locked group, as cli-core's lock refuses a reference. */
export const refuseOutsideAction = async (store: MessageStore, env: NodeJS.ProcessEnv, id: string) => {
  const guard = await guardOf(store, env)
  if (guard !== undefined && !(await guard.visible(`action:${id}`)))
    throw new CliError(
      "permission_error",
      `this process is locked to group ${guard.group} — action ${id} is outside it`,
      {
        reason: "group.outside",
      },
    )
}

/** The actions of a list a locked run may see. */
export const actionsIn = async <T extends { id: string }>(
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  actions: readonly T[],
): Promise<T[]> => {
  const guard = await guardOf(store, env)
  if (guard === undefined) return [...actions]
  const kept: T[] = []
  for (const one of actions) if (await guard.visible(`action:${one.id}`)) kept.push(one)
  return kept
}
