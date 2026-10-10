import { CliError } from "@wirecat/cli-core"
import { parseLocator } from "@wirecat/cli-messaging"
import type { AccountKey, KnowledgeTarget, MessageStore } from "@wirecat/cli-messaging/store"

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
  entity?: string
}

export const selectAccount = async (store: MessageStore, scope: AccountScope): Promise<AccountKey> => {
  if (!scope.provider)
    throw new CliError("validation_error", "select --provider and, when several accounts exist, --account")
  const matches = (await store.accounts()).filter(
    (key) => key.provider === scope.provider && (scope.account === undefined || key.account === scope.account),
  )
  if (matches.length !== 1)
    throw new CliError(
      matches.length ? "validation_error" : "not_found",
      matches.length
        ? "several accounts match; select --account explicitly"
        : `the store holds no ${scope.provider} account matching this selection`,
    )
  return matches[0] as AccountKey
}

export const selectTarget = async (
  store: MessageStore,
  input: TargetInput,
): Promise<{ key: AccountKey; target: KnowledgeTarget }> => {
  const choices = ["message", "chat", "contact", "person", "task", "entity"] as const
  const selected = choices.filter((name) => input[name] !== undefined)
  if (selected.length !== 1)
    throw new CliError(
      "validation_error",
      "select exactly one of --message, --chat, --contact, --person, --task or --entity",
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
