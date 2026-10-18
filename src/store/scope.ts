import { CliError } from "@wirecat/cli-base"
import { parseLocator } from "@wirecat/cli-core"
import type { AccountKey, KnowledgeTarget, MessageStore } from "@wirecat/cli-core/store"
import { oneAccountOf, type WriteOptions, writeAccountOf } from "./source-list.js"

export interface AccountScope {
  provider?: string
  account?: string
}
export interface TargetInput extends AccountScope {
  message?: string
  chat?: string
  contact?: string
  person?: string
  task?: string
  organization?: string
  project?: string
  meeting?: string
}

const choices = (keys: AccountKey[]) =>
  keys.length ? `; choose one of ${keys.map(({ provider, account }) => `${provider}:${account}`).join(", ")}` : ""

export const selectAccount = async (store: MessageStore, scope: AccountScope): Promise<AccountKey> => {
  // A notes folder is stored as a `folder` account, which no --account takes.
  const held = (await store.accounts.accounts()).filter(({ provider }) => provider !== "folder")
  if (!scope.provider)
    throw new CliError(
      "validation_error",
      held.length
        ? `give --account <provider>:<account>${choices(held)}`
        : "give --account <provider>:<account> — the store holds no tg, max or mail account yet",
    )
  const matches = held.filter(
    (key) => key.provider === scope.provider && (scope.account === undefined || key.account === scope.account),
  )
  if (matches.length !== 1)
    throw new CliError(
      matches.length ? "validation_error" : "not_found",
      matches.length
        ? `several accounts match; give one${choices(matches)}`
        : `the store holds no ${scope.provider} account matching this selection${choices(held)}`,
    )
  return matches[0] as AccountKey
}

/** The `meeting:<account id>/<meeting id>` reference for a meeting the selected account holds. */
export const meetingReference = async (store: MessageStore, id: string, scope: AccountScope): Promise<string> => {
  if (!/^\d+$/.test(id)) throw new CliError("validation_error", "--meeting takes the meeting's id in the store")
  const account = await store.accounts.storedAccount(await selectAccount(store, scope))
  const found = await store.meetings.meeting(Number(id))
  if (found === null || found.meeting.accountId !== account.id)
    throw new CliError("not_found", `the ${account.provider} account ${account.account} holds no meeting ${id}`)
  return `meeting:${account.id}/${found.meeting.id}`
}

export const selectTarget = async (
  store: MessageStore,
  input: TargetInput,
): Promise<{ key: AccountKey; target: KnowledgeTarget }> => {
  const choices = ["message", "chat", "contact", "person", "task", "organization", "project", "meeting"] as const
  const selected = choices.filter((name) => input[name] !== undefined)
  if (selected.length !== 1)
    throw new CliError(
      "validation_error",
      "select exactly one of --message, --chat, --contact, --person, --task, --organization, --project or --meeting",
    )
  const type = selected[0] as (typeof choices)[number]
  if (type === "message") {
    const locator = input.message as string
    let parsed: ReturnType<typeof parseLocator>
    try {
      parsed = parseLocator(locator)
    } catch {
      throw new CliError("validation_error", "give a valid msg: source locator")
    }
    if ((input.provider && parsed.provider !== input.provider) || (input.account && parsed.account !== input.account))
      throw new CliError("validation_error", "locator and selected account disagree")
    return { key: { provider: parsed.provider, account: parsed.account }, target: { type, locator } }
  }
  return { key: await selectAccount(store, input), target: { type, id: input[type] as string } }
}

/** A write's `--account` as the scope the helpers above take, resolved only when given: a locator may name it. */
export const scopeOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: WriteOptions,
  warn: (text: string) => void,
): Promise<AccountScope> => {
  const value = writeAccountOf(options, warn)
  return value === undefined ? {} : oneAccountOf(store, env, value, "--account")
}
