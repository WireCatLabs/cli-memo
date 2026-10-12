import type { Author } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { oneOf } from "./options.js"

/**
 * Who writes: the agent whose terminal runs memo, by the variables cli-base's skill hint reads, else the
 * owner. `AI_AGENT` carries a version (`claude-code_2-1-296_agent`); one bot per release would split
 * the agent's history, so only the name before it is kept.
 */
export const authorOf = (env: NodeJS.ProcessEnv, by?: "owner"): Author => {
  if (by === "owner") return "owner"
  const agent = env.AI_AGENT?.trim().split("_")[0]
  if (agent) return { bot: agent }
  return env.CLAUDECODE ? { bot: "claude-code" } : "owner"
}

/** A label, not a check: an agent can pass it too, and is told not to. */
export const byOption = (command: Command) =>
  command.option(
    "--by <author>",
    "owner: record it as yours although an agent's terminal runs memo (AI_AGENT or CLAUDECODE set)",
    oneOf(["owner"] as const),
  )
