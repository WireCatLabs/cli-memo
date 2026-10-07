import { CliError } from "@leemour/cli-core"
import { formatLocator, parseLocator } from "@leemour/cli-messaging"
import type { AccountKey, TagTarget } from "@leemour/cli-messaging/store"

export interface SourceScope {
  provider?: string
  account?: string
}

export interface SourceTargetInput extends SourceScope {
  message?: string
  chat?: string
}

export interface SourceTarget {
  key: AccountKey
  target: Exclude<TagTarget, { type: "contact" }>
  locator?: string
}

export const sourceTarget = ({ message, chat, provider, account }: SourceTargetInput): SourceTarget => {
  if (message !== undefined) {
    if (chat !== undefined || provider !== undefined || account !== undefined)
      throw new CliError("validation_error", "a message locator names its account and chat — use --message alone")
    let parsed: ReturnType<typeof parseLocator>
    try {
      parsed = parseLocator(message)
    } catch (error) {
      if (error instanceof URIError) throw new CliError("validation_error", "invalid percent encoding in the locator")
      throw error
    }
    return {
      key: { provider: parsed.provider, account: parsed.account },
      target: { type: "message", chatId: parsed.chat, messageId: parsed.message },
      locator: formatLocator(parsed),
    }
  }
  if (chat === undefined || provider === undefined || account === undefined)
    throw new CliError(
      "validation_error",
      "name --message <locator>, or --chat <id> with --provider <provider> and --account <account>",
    )
  if (!chat.trim() || !provider.trim() || !account.trim())
    throw new CliError("validation_error", "the provider, account and chat id must not be empty")
  return { key: { provider, account }, target: { type: "chat", chatId: chat } }
}
