import { openSync } from "node:fs"
import { createInterface } from "node:readline"
import { ReadStream } from "node:tty"
import { CliError } from "@wirecat/cli-base"
import { environmentOf } from "@wirecat/cli-core/cli"
import type { Author, Decider } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { terminalOf } from "./terminal.js"

/**
 * The bot a run is recorded as when nothing names who runs it: no agent variable, and no person at a terminal. A
 * missing variable proves nothing; such a run proposes, and never decides.
 */
export const UNATTENDED = "unattended"

/** Read from the terminal itself, not stdin, which may hold the command's input. */
const fromTerminal = async (question: string): Promise<string | null> => {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null
  let input: ReadStream
  try {
    input = new ReadStream(openSync("/dev/tty", "r"))
  } catch {
    return null
  }
  const reader = createInterface({ input, output: process.stderr, terminal: true })
  try {
    return await new Promise<string>((resolve, reject) => {
      const cancel = () => reject(new CliError("cancelled", "cancelled — nothing was done"))
      reader.once("SIGINT", cancel)
      reader.once("close", cancel)
      reader.question(question, resolve)
    })
  } finally {
    reader.close()
    input.destroy()
  }
}

/**
 * The agent named by the variables cli-base's skill hint reads. `AI_AGENT` carries a version
 * (`claude-code_2-1-296_agent`); one bot per release would split the agent's history, so only the name before it is
 * kept.
 */
const agentIn = (env: NodeJS.ProcessEnv): string | undefined => {
  if (env.AI_AGENT === "memo-mcp") return env.MEMO_MCP_CLIENT?.trim() || "memo-mcp"
  const agent = env.AI_AGENT?.trim().split("_")[0]
  if (agent) return agent
  return env.CLAUDECODE ? "claude-code" : undefined
}

/** Who writes, by the environment alone; for writes that decide nothing for the owner, such as a task edit. */
export const authorOf = (env: NodeJS.ProcessEnv): Author => {
  const agent = agentIn(env)
  return agent === undefined ? "owner" : { bot: agent }
}

const ownerSays = async (command: Command, question: string): Promise<void> => {
  const machine = command.opts<{ json?: unknown }>().json !== undefined
  // A harness that gives an agent a terminal would wait for ever on a question under --json.
  const answer =
    terminalOf(command).present && !machine
      ? await (terminalOf(command).answer ?? environmentOf(command).answer ?? fromTerminal)(`${question} [y/N] `)
      : null
  if (answer === null)
    throw new CliError(
      "confirmation_required",
      "--as-owner asks at a terminal, and nobody is at one to answer; the owner runs it there, without --json",
      { reason: "decision.owner-unconfirmed" },
    )
  if (!/^\s*y(es)?\s*$/i.test(answer)) throw new CliError("cancelled", "not done — the answer was no")
}

/**
 * Who runs this command. An MCP call is the agent's. `--from-app` is the owner's: the app says the owner clicked, and
 * memo takes its word, even with an agent variable set (NEED-2403). An agent's terminal is the agent's; `--as-owner`
 * there makes it the owner's only after a yes at a real terminal. With no agent named, the owner only when stdin and
 * stdout are a terminal: anything else is an unattended run, recorded as one.
 */
export const whoRuns = async (
  command: Command,
  env: NodeJS.ProcessEnv,
  { asOwner = false, question }: { asOwner?: boolean | undefined; question: string },
): Promise<"owner" | { bot: string }> => {
  if (environmentOf(command).agent || env.AI_AGENT === "memo-mcp") {
    if (asOwner) throw new CliError("permission_error", "an agent cannot act as the owner; the owner runs this command")
    return { bot: agentIn(env) ?? "memo-mcp" }
  }
  if (command.opts<{ fromApp?: boolean }>().fromApp) return "owner"
  const agent = agentIn(env)
  if (agent === undefined && terminalOf(command).present) return "owner"
  if (!asOwner) return { bot: agent ?? UNATTENDED }
  await ownerSays(command, question)
  return "owner"
}

/** The decider a store decide method takes. An unattended run is refused: it could be anyone, its own proposer too. */
export const deciderOf = async (
  command: Command,
  env: NodeJS.ProcessEnv,
  { asOwner, reason, question }: { asOwner?: boolean | undefined; reason?: string | undefined; question: string },
): Promise<Decider> => {
  const who = await whoRuns(command, env, { asOwner, question })
  if (who === "owner") return "owner"
  if (who.bot === UNATTENDED)
    throw new CliError(
      "confirmation_required",
      "no agent is named and nobody is at a terminal, so nothing shows who decides; the owner decides at a " +
        "terminal, an agent from its own session with --reason",
      { reason: "decision.decider-unknown" },
    )
  if (!reason?.trim())
    throw new CliError("validation_error", "an agent deciding for the owner gives --reason", {
      reason: "proposal.reason-required",
      param: "reason",
    })
  return { bot: who.bot, reason: reason.trim() }
}

/** An app's claim, not a check: anything that runs memo can pass it, so it is no security boundary. */
export const fromAppOption = (command: Command) =>
  command.option("--from-app", "you did this in WireCat Desktop: record it as yours, with no terminal question")

export const byOption = (command: Command) =>
  fromAppOption(
    command.option(
      "--as-owner",
      "act as you although an agent's terminal runs memo (AI_AGENT or CLAUDECODE set); asks y/N at the terminal",
    ),
  )

export const reasonOption = (command: Command) =>
  command.option("--reason <text>", "why, in a few words; required when an agent decides for you")
