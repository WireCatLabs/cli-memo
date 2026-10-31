import { spawn } from "node:child_process"
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import type { ProjectChatFetcher } from "@wirecat/cli-core/services"

/** The WireCat messenger CLI that holds each provider's connection: its command and where it keeps its state. */
const TOOLS: Record<string, { tool: string; appName: string; envPrefix: string }> = {
  telegram: { tool: "tg", appName: "tg-cli", envPrefix: "TG" },
  max: { tool: "max", appName: "max-cli", envPrefix: "MAX" },
  whatsapp: { tool: "wa", appName: "whatsapp-cli", envPrefix: "WA" },
}

export const messengerToolOf = (provider: string) => TOOLS[provider]

/**
 * The profile signed in to this account, from the CLI's own record of it (`<state>/accounts/<profile>.json`). Exact
 * match only: memo never picks a profile for the owner.
 */
export const profileFor = (
  provider: string,
  account: string,
  env: NodeJS.ProcessEnv,
): { profile: string } | { profiles: string[] } | undefined => {
  const tool = TOOLS[provider]
  if (!tool) return undefined
  const dir = join(resolvePaths({ appName: tool.appName, prefix: tool.envPrefix, env }).state, "accounts")
  const profiles = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .sort()
    : []
  const matching = profiles.filter((profile) => {
    try {
      return JSON.parse(readFileSync(join(dir, `${profile}.json`), "utf8"))?.account === account
    } catch {
      return false
    }
  })
  return matching.length === 1 && matching[0] ? { profile: matching[0] } : { profiles }
}

const onPath = (name: string, env: NodeJS.ProcessEnv) =>
  (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, name))
    .find((path) => {
      try {
        return statSync(path).isFile()
      } catch {
        return false
      }
    })

export interface ChildRun {
  code: number | null
  stdout: string
}
/** Runs a child to its end; `onStderr` hears each line it writes there, `signal` stops it. */
export type RunChild = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; signal?: AbortSignal; onStderr?: (line: string) => void },
) => Promise<ChildRun>

/** SIGINT first, as Ctrl-C: a sync stops after its page and keeps it. */
export const runChild: RunChild = (command, args, { env, signal, onStderr }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let pending = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      const lines = (pending + chunk).split("\n")
      pending = lines.pop() ?? ""
      for (const line of lines) if (line) onStderr?.(line)
    })
    let hard: NodeJS.Timeout | undefined
    const stop = () => {
      child.kill("SIGINT")
      hard = setTimeout(() => child.kill("SIGTERM"), 10_000)
    }
    signal?.addEventListener("abort", stop, { once: true })
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(hard)
      signal?.removeEventListener("abort", stop)
      if (pending) onStderr?.(pending)
      resolve({ code, stdout })
    })
  })

/**
 * `wcat-<tool>` when it answers `--wcat-describe` as that tool, else the short name when its file is a WireCat
 * package's (its real path, or the package manager's shim, names `@wirecat/<app>`). Another program by that name is
 * never run.
 */
export const binaryOf = async (
  provider: string,
  env: NodeJS.ProcessEnv,
  run: RunChild,
): Promise<string | undefined> => {
  const tool = TOOLS[provider]
  if (!tool) return undefined
  const umbrella = onPath(`wcat-${tool.tool}`, env)
  if (umbrella) {
    const described = await run(umbrella, ["--wcat-describe"], { env }).catch(() => undefined)
    try {
      if (described?.code === 0 && JSON.parse(described.stdout)?.name === tool.tool) return umbrella
    } catch {}
  }
  const short = onPath(tool.tool, env)
  if (!short) return undefined
  const mark = `@wirecat/${tool.appName}`
  const real = realpathSync(short)
  if (real.includes(`/${mark}/`)) return short
  return statSync(real).size < 65_536 && readFileSync(real, "utf8").includes(mark) ? short : undefined
}

interface SyncAnswer {
  item?: { complete?: boolean; reached_since?: boolean; stopped?: boolean; issue?: { code?: string } }
  error?: { code?: string; message?: string }
}

const answerOf = (stdout: string): SyncAnswer => {
  try {
    return JSON.parse(stdout.trim().split("\n").at(-1) ?? "")
  } catch {
    return {}
  }
}

/** Leaves the child time to save its last page and answer before the budget ends. */
const MARGIN_MS = 5_000

/**
 * Syncs a linked chat by running its messenger CLI, `<bin> <profile> messages sync <chat> --since-time <start>`:
 * memo holds no messenger connection. What the child writes to stderr is passed on as it comes.
 */
export const messengerFetcher = ({
  env,
  note,
  run = runChild,
  now = Date.now,
}: {
  env: NodeJS.ProcessEnv
  note: (line: string) => void
  run?: RunChild
  now?: () => number
}): ProjectChatFetcher => {
  const binaries = new Map<string, Promise<string | undefined>>()
  return {
    fetch: async ({ account, chatId, after, until, signal }) => {
      const tool = TOOLS[account.provider]
      if (!tool) return { state: "failed", reason: `no WireCat messenger CLI syncs ${account.provider}` }
      const found = profileFor(account.provider, account.account, env)
      if (!found || !("profile" in found))
        return {
          state: "failed",
          reason:
            `no ${tool.tool} profile is signed in to account ${account.account}` +
            ` (profiles: ${found?.profiles.join(", ") || "none"})`,
        }
      if (!binaries.has(tool.tool)) binaries.set(tool.tool, binaryOf(account.provider, env, run))
      const bin = await binaries.get(tool.tool)
      if (!bin) return { state: "failed", reason: `${tool.tool} is not installed, or the one on PATH is not WireCat's` }
      const seconds = Math.max(1, Math.floor((until - now() - MARGIN_MS) / 1000))
      const args = [
        found.profile,
        "messages",
        "sync",
        "--since-time",
        new Date(after).toISOString(),
        "--limit",
        "1000000",
        "--timeout",
        `${seconds}s`,
        "--json",
        // A Telegram group id starts with a minus, which would read as an option.
        "--",
        chatId,
      ]
      const done = await run(bin, args, { env, signal, onStderr: (line) => note(`${tool.tool}: ${line}`) })
      const answer = answerOf(done.stdout)
      if (done.code !== 0) {
        const why = answer.error?.message?.split("\n")[0]
        const code = answer.error?.code ?? `exit ${done.code ?? "signal"}`
        return {
          state: "partial",
          reason: `${tool.tool} ${found.profile} messages sync: ${code}${why ? ` — ${why}` : ""}`,
        }
      }
      const item = answer.item ?? {}
      if (item.issue?.code) return { state: "partial", reason: item.issue.code }
      if (item.stopped || signal.aborted) return { state: "partial", reason: "fetch-budget" }
      return item.complete || item.reached_since ? { state: "complete" } : { state: "partial", reason: "limit" }
    },
  }
}

/** The command that syncs one chat here, with the profile when exactly one is signed in to its account. */
export const syncHint = (
  chat: { provider: string; account: string; chat: string },
  since: string,
  env: NodeJS.ProcessEnv,
): string | null => {
  const tool = TOOLS[chat.provider]
  if (!tool) return null
  const found = profileFor(chat.provider, chat.account, env)
  const target = chat.chat.startsWith("-")
    ? `--since-time ${since} -- ${chat.chat}`
    : `${chat.chat} --since-time ${since}`
  const line = (profile: string) => `${tool.tool} ${profile} messages sync ${target}`
  if (found && "profile" in found) return line(found.profile)
  return `${line("<profile>")} (no ${tool.tool} profile here is signed in to account ${chat.account}; profiles: ${
    found?.profiles.join(", ") || "none"
  })`
}
