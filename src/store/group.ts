import { CliError } from "@wirecat/cli-base"
import { kindIn } from "@wirecat/cli-core"
import { refuseOutsideGroup, runGroup } from "@wirecat/cli-core/cli"
import {
  entriesOfList,
  type GroupContext,
  keyOf,
  listContextOf,
  PERSONAL,
  type RunGroup,
  scopeToGroup,
  sourceOf,
} from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { withStore } from "../answer.js"
import { APP } from "../app.js"

/**
 * The account memo's reads run as: its own notes. It names no stored account, so the list reader never adds it to
 * `held` as a new one.
 */
export const MEMO_ACCOUNT: AccountKey = { provider: "notes", account: "internal" }

/** Who runs, as cli-core's source lists see it: memo, so `group:` and profiles resolve as every app saved them. */
export const memoListContext = async (store: MessageStore, env: NodeJS.ProcessEnv): Promise<GroupContext> => {
  const held = await store.accounts.storedAccounts()
  // listContextOf adds the running account when the store has no row for it; memo's own notes are no account.
  const context = await listContextOf(store, MEMO_ACCOUNT, APP, held, env)
  return {
    ...context,
    held: context.held.filter((one) => one.id !== 0 || keyOf(one) !== keyOf(MEMO_ACCOUNT)),
  }
}

/** The group this run reads (WC-ACCT-13): the first word, `MEMO_GROUP` or the lock `MEMO_GROUP_LOCK`. */
export const groupOf = (env: NodeJS.ProcessEnv, word?: string): RunGroup | undefined => runGroup(APP, env, word)

export interface GroupScope {
  run: RunGroup
  accounts: AccountKey[]
  has: (key: AccountKey) => boolean
}

const scopeIn = (run: RunGroup, context: GroupContext): GroupScope => {
  // Refuses an unknown or empty group the same way a `--source` would.
  scopeToGroup(run, {}, context)
  const accounts = entriesOfList(`group:${run.name}`, context).flatMap((entry) =>
    entry.accounts.map(({ provider, account }) => ({ provider, account })),
  )
  const keys = new Set(accounts.map(keyOf))
  return { run, accounts, has: (key) => keys.has(keyOf(key)) }
}

export const groupScopeOf = async (store: MessageStore, env: NodeJS.ProcessEnv): Promise<GroupScope | undefined> => {
  const run = groupOf(env)
  return run === undefined ? undefined : scopeIn(run, await memoListContext(store, env))
}

export type GroupKind = "messages" | "mail" | "notes" | "events" | "crm"

/**
 * The group's accounts of each kind `search all` reads. The owner's own notes (`memo notes add`) belong to no
 * account: `personal`, the group of everything not set apart, holds them; any other group does not.
 */
export const accountsByKind = (scope: GroupScope): Record<GroupKind, AccountKey[]> => {
  const kinds: Record<GroupKind, AccountKey[]> = { messages: [], mail: [], notes: [], events: [], crm: [] }
  for (const key of scope.accounts) {
    const kind = kindIn(key.provider)
    if (kind === "documents") kinds.notes.push(key)
    else if (kind !== undefined && kind !== "meetings" && kind in kinds) kinds[kind as GroupKind].push(key)
  }
  if (scope.run.name === PERSONAL) kinds.notes.push(MEMO_ACCOUNT)
  return kinds
}

/** Every stored account, or only the group's when the run is in one. */
export const scopedAccounts = async (store: MessageStore, env: NodeJS.ProcessEnv): Promise<AccountKey[]> => {
  const all = await store.accounts.accounts()
  const scope = await groupScopeOf(store, env)
  return scope === undefined ? all : all.filter(scope.has)
}

/** Keeps only the group's accounts; every one when the run is in no group. */
export const inGroup = async <T extends AccountKey>(
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  keys: readonly T[],
): Promise<T[]> => {
  const scope = await groupScopeOf(store, env)
  return scope === undefined ? [...keys] : keys.filter(scope.has)
}

/**
 * Whether a thing belongs to the run's group, as cli-core's lock judges a reference: a thing no account brought is
 * the owner's and passes, a note written in memo is `personal`'s, and a person passes when one identity is in it.
 */
export const refInGroup = async (store: MessageStore, scope: GroupScope, ref: string): Promise<boolean> => {
  const accounts = await store.refs.accounts(ref)
  if (!accounts?.length) return true
  return accounts.some((key) => scope.has(key) || (scope.run.name === PERSONAL && keyOf(key) === keyOf(MEMO_ACCOUNT)))
}

/**
 * A relationship named by its bare id carries no reference cli-core's lock can map, so its ends and the account that
 * reported it are checked here.
 */
export const refuseOutsideRelation = async (store: MessageStore, env: NodeJS.ProcessEnv, id: string): Promise<void> => {
  const scope = await groupScopeOf(store, env)
  if (scope === undefined) return
  const relation = (await store.knowledge.relations(null)).find((one) => one.id === id)
  if (relation === undefined) return
  const reported = relation.account === undefined || scope.accounts.some((key) => sourceOf(key) === relation.account)
  if (reported && (await refInGroup(store, scope, relation.from)) && (await refInGroup(store, scope, relation.to)))
    return
  throw new CliError(
    scope.run.locked ? "permission_error" : "validation_error",
    `${scope.run.locked ? "this process is locked to" : "this run is in"} group ${scope.run.name} — relationship ${id} ` +
      "joins a thing outside it",
  )
}

/** The items of a list that belong to the run's group; every one when the run is in no group. */
export const keepInGroup = async <T>(
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  items: readonly T[],
  refOf: (item: T) => string,
): Promise<T[]> => {
  const scope = await groupScopeOf(store, env)
  if (scope === undefined) return [...items]
  const kept: T[] = []
  for (const item of items) if (await refInGroup(store, scope, refOf(item))) kept.push(item)
  return kept
}

const optionValue = (command: Command, name: string): string | undefined => {
  const value = command.getOptionValue(name)
  return typeof value === "string" ? value : undefined
}

const declares = (command: Command, name: string) => command.options.some((option) => option.attributeName() === name)

/**
 * Before every action: under MEMO_GROUP_LOCK cli-core refuses a command not marked `groupAware` and any reference
 * whose thing is outside the group (WC-ACCT-13). In a group, no `--source` becomes `group:<name>`, a given one is
 * narrowed to the group, and an outside `--account` is refused. `word` is the first word `liftGroup` lifted.
 */
export const scopeRunsToGroup = (program: Command, env: NodeJS.ProcessEnv, word?: string): void => {
  program.hook("preAction", async (_root, command) => {
    const run = groupOf(env, word)
    if (run === undefined) return
    await withStore(env, async (store) => {
      await refuseOutsideGroup(command, { app: APP, env, store })
      const context = await memoListContext(store, env)
      const source = declares(command, "source") ? optionValue(command, "source") : undefined
      const account = declares(command, "account") ? optionValue(command, "account") : undefined
      const scoped = scopeToGroup(
        run,
        { ...(source === undefined ? {} : { source }), ...(account === undefined ? {} : { account }) },
        context,
      )
      // `--all` and `--source` are each other's opposite; under a group, `--all` reads the group's accounts itself.
      if (declares(command, "source") && scoped.source !== undefined && command.getOptionValue("all") !== true)
        command.setOptionValue("source", scoped.source)
    })
  })
}
