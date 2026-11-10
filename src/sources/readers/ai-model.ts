import { CliError, isCliError } from "@wirecat/cli-base"
import { aiLeavesComputer, aiSettingPath, aiTextReader, readAiSetting } from "@wirecat/cli-core/documents"
import { APP } from "../../app.js"
import type { Reader, ReaderContext } from "./types.js"

const SET = "memo models ai set"

const chosen = (context: ReaderContext) =>
  aiTextReader({
    app: APP,
    env: context.env,
    fetch: context.fetch,
    ...(context.keyring ? { keyring: context.keyring } : {}),
    ...(context.signal ? { signal: context.signal } : {}),
  })

/** A shared setting this memo cannot read (a newer tool wrote it) counts as none, so the other readers still work. */
const setting = (env: NodeJS.ProcessEnv) => {
  try {
    return readAiSetting(aiSettingPath(env))
  } catch {
    return undefined
  }
}

const reader = (context: ReaderContext) => {
  try {
    return chosen(context)
  } catch {
    return { refused: "ai.not-set" as const }
  }
}

const problemOf = (refused: string) =>
  refused === "ai.not-set" ? `no AI model is chosen: ${SET}` : `the AI model has no key: ${SET} --secret-stdin`

/** The model the owner chose for every WireCat tool (`models ai set`), with its one key. */
export const aiModel: Reader = {
  id: "ai-model",
  title: "AI model",
  provider: "ai-model",
  leavesComputer: (env) => {
    const found = setting(env)
    return found === undefined || aiLeavesComputer(found)
  },
  modelOf: (env) => {
    const found = setting(env)
    return found ? `${found.provider}/${found.model}` : null
  },
  readsFiles: false,
  needsModel: false,
  probe: async (context) => {
    const found = reader(context)
    const refused = "refused" in found ? found.refused : undefined
    return {
      available: refused !== "ai.not-set",
      signedIn: refused === undefined,
      version: null,
      models: "refused" in found ? null : [found.by],
      problem: refused === undefined ? null : problemOf(refused),
    }
  },
  read: async (context, { system, prompt }) => {
    const found = reader(context)
    if ("refused" in found)
      throw found.refused === "ai.not-set"
        ? new CliError("configuration_error", problemOf(found.refused), { reason: "reader.ai-not-set" })
        : new CliError("authentication_error", problemOf(found.refused), { reason: "reader.no-key" })
    try {
      return await found.complete({ purpose: "sources", system, prompt, maxTokens: 4096 })
    } catch (error) {
      if (isCliError(error) && error.code === "rate_limited")
        throw new CliError("rate_limited", `${found.by} says the limit is reached; try later`, {
          reason: "reader.limit",
        })
      throw new CliError(
        "invalid_response",
        `${found.by} failed: memo models ai check names the cause (key, model, credit or address)`,
        { reason: "reader.failed" },
      )
    }
  },
}
