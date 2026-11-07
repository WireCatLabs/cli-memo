import { CliError } from "@wirecat/cli-base"
import { kindIn } from "@wirecat/cli-core"
import { runGroup } from "@wirecat/cli-core/cli"
import {
  entriesOfList,
  type GroupContext,
  keyOf,
  listContextOf,
  PERSONAL,
  type RunGroup,
  scopeToGroup,
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
  if (scope.run.name === PERSONAL) kinds.notes.push({ provider: "notes", account: "internal" })
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

const outside = (scope: GroupScope, what: string) =>
  new CliError(
    scope.run.locked ? "permission_error" : "validation_error",
    scope.run.locked
      ? `this process is locked to group ${scope.run.name} (${scope.run.from}) — ${what} is outside it`
      : `this run is in group ${scope.run.name} — ${what} is outside it`,
  )

/** Refuses a key outside the run's group: what a read by reference or id checks before it opens anything. */
export const refuseOutsideGroup = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  key: AccountKey,
  what = `${key.provider}:${key.account}`,
): Promise<void> => {
  const scope = await groupScopeOf(store, env)
  if (scope !== undefined && !scope.has(key)) throw outside(scope, what)
}

const REF = /^(?:msg|chat):([^/\s]+)\/([^/\s]+)(?:\/|$)/

/** `msg:<provider>/<account>/…` and `chat:<provider>/<account>/…` name the account they were read from. */
const accountOfRef = (word: string): AccountKey | undefined => {
  const [, provider, account] = REF.exec(word.trim()) ?? []
  if (provider === undefined || account === undefined) return undefined
  try {
    return { provider: decodeURIComponent(provider), account: decodeURIComponent(account) }
  } catch {
    return undefined
  }
}

const optionValue = (command: Command, name: string): string | undefined => {
  const value = command.getOptionValue(name)
  return typeof value === "string" ? value : undefined
}

const declares = (command: Command, name: string) => command.options.some((option) => option.attributeName() === name)

/**
 * Scopes every run in a group before its action (WC-ACCT-13): no `--source` becomes `group:<name>`, a given one is
 * narrowed to the group, an outside account or `--account` is refused, and so is a reference to a message or chat
 * of an account outside it. `word` is the first word `liftGroup` took off the command line.
 */
export const scopeRunsToGroup = (program: Command, env: NodeJS.ProcessEnv, word?: string): void => {
  program.hook("preAction", async (_root, command) => {
    const run = groupOf(env, word)
    if (run === undefined) return
    await withStore(env, async (store) => {
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
      const scope = scopeIn(run, context)
      for (const argument of command.args) {
        const key = accountOfRef(argument)
        if (key !== undefined && !scope.has(key)) throw outside(scope, argument)
      }
    })
  })
}
