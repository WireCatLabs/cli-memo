import { CliError, isCliError } from "@wirecat/cli-base"
import { modelGateway } from "@wirecat/cli-core/models"
import { type KeyProvider, providerKeys } from "./keys.js"
import type { Reader } from "./types.js"

/** A provider's API with the owner's own key from the keyring, through cli-core's model gateway. */
const apiReader = (provider: KeyProvider, title: string): Reader => ({
  id: provider,
  title,
  provider,
  leavesComputer: true,
  readsFiles: false,
  needsModel: true,
  probe: async (context) => {
    const kept = providerKeys(context).read(provider) !== undefined
    return {
      available: true,
      signedIn: kept,
      version: null,
      models: null,
      problem: kept ? null : `no ${title} key: memo models keys set ${provider}`,
    }
  },
  read: async (context, { system, prompt, model }) => {
    const key = providerKeys(context).read(provider)
    if (key === undefined)
      throw new CliError("authentication_error", `no ${title} key: memo models keys set ${provider}`, {
        reason: "reader.no-key",
      })
    const gateway = modelGateway({
      resolve: () => ({ provider, model: model ?? "" }),
      // The owner chose this reader for sources by name; that choice is the consent.
      consent: () => true,
      key: () => key,
      fetch: context.fetch,
      ...(context.signal ? { signal: context.signal } : {}),
    })
    try {
      return (await gateway.complete({ purpose: "sources", system, prompt, maxTokens: 4096 })).text
    } catch (error) {
      if (isCliError(error) && error.code === "rate_limited")
        throw new CliError("rate_limited", `${title} says the limit is reached; try later`, { reason: "reader.limit" })
      throw new CliError(
        "invalid_response",
        `${title} failed: check the key (memo models keys set ${provider}), the model and the account's credit`,
        { reason: "reader.failed" },
      )
    }
  },
})

export const openaiReader = apiReader("openai", "OpenAI")
export const anthropicReader = apiReader("anthropic", "Anthropic")
