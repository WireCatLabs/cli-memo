import { spawn } from "node:child_process"
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import type { ProjectChatFetcher } from "@wirecat/cli-core/services"
import { InvalidArgumentError } from "commander"

/** The WireCat messenger CLI that holds each provider's connection: its command and where it keeps its state. */
const TOOLS: Record<string, { tool: string; appName: string; envPrefix: string }> = {
  telegram: { tool: "tg", appName: "tg-cli", envPrefix: "TG" },
  max: { tool: "max", appName: "max-cli", envPrefix: "MAX" },
  whatsapp: { tool: "wa", appName: "whatsapp-cli", envPrefix: "WA" },
}

export const messengerToolOf = (provider: string) => TOOLS[provider]

/** `--sync-profile max=default`: the profile memo runs a messenger CLI as, one per tool. */
export const syncProfileOf = (value: string, previous: Record<string, string> = {}): Record<string, string> => {
  const [tool, profile] = value.split("=", 2)
  const tools = Object.values(TOOLS).map((one) => one.tool)
  if (!tool || !profile || !tools.includes(tool))
    throw new InvalidArgumentError(`<tool>=<profile>, where the tool is ${tools.join(", ")}: max=default`)
  if (previous[tool] !== undefined && previous[tool] !== profile)
    throw new InvalidArgumentError(`one profile per tool; ${tool} is already ${previous[tool]}`)
  return { ...previous, [tool]: profile }
}

/**
 * The profile signed in to this account, from the CLI's own record of it (`<state>/accounts/<profile>.json`). memo
 * never picks one for the owner: one signed in is used, several or none is a refusal naming them, and a profile the
 * owner chose with `--sync-profile` must be signed in to this account too.
 */
export const profileFor = (
  provider: string,
  account: string,
  env: NodeJS.ProcessEnv,
  chosen: Record<string, string> = {},
): { profile: string } | { why: string } | undefined => {
  const tool = TOOLS[provider]
  if (!tool) return undefined
  const dir = join(resolvePaths({ appName: tool.appName, prefix: tool.envPrefix, env }).state, "accounts")
  const profiles = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .sort()
    : []
  const accountOf = (profile: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(dir, `${profile}.json`), "utf8"))?.account
    } catch {
      return undefined
    }
  }
  const all = profiles.join(", ") || "none"
  const pick = chosen[tool.tool]
  if (pick !== undefined) {
    if (!profiles.includes(pick)) return { why: `${tool.tool} profile ${pick} is not signed in here; profiles: ${all}` }
    const held = accountOf(pick)
    return held === account
      ? { profile: pick }
      : { why: `${tool.tool} profile ${pick} is signed in to account ${String(held)}, not ${account}` }
  }
  const matching = profiles.filter((profile) => accountOf(profile) === account)
  if (matching.length === 1 && matching[0]) return { profile: matching[0] }
  if (matching.length > 1)
    return {
      why:
        `${matching.length} ${tool.tool} profiles are signed in to account ${account}: ${matching.join(", ")}` +
        ` — choose one with --sync-profile ${tool.tool}=<profile>`,
    }
  return { why: `no ${tool.tool} profile here is signed in to account ${account}; profiles: ${all}` }
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
  chosen = {},
  run = runChild,
  now = Date.now,
}: {
  env: NodeJS.ProcessEnv
  note: (line: string) => void
  chosen?: Record<string, string>
  run?: RunChild
  now?: () => number
}): ProjectChatFetcher => {
  const binaries = new Map<string, Promise<string | undefined>>()
  return {
    fetch: async ({ account, chatId, after, until, signal }) => {
      const tool = TOOLS[account.provider]
      if (!tool) return { state: "failed", reason: `no WireCat messenger CLI syncs ${account.provider}` }
      const found = profileFor(account.provider, account.account, env, chosen)
      if (!found || !("profile" in found)) return { state: "failed", reason: found?.why ?? "no profile" }
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
      const done = await run(bin, args, {
        env,
        signal,
        onStderr: (line) => {
          if (!isEvent(line)) note(`${tool.tool}: ${line}`)
        },
      })
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

/** With `--json` the child writes each progress event twice, as a JSON line and as a sentence: the sentence is kept. */
const isEvent = (line: string) => {
  if (!line.startsWith("{")) return false
  try {
    return typeof JSON.parse(line)?.event === "string"
  } catch {
    return false
  }
}

type LinkedChat = { provider: string; account: string; chat: string }

/** The command that syncs one chat here, or why there is none: no profile, or more than one, for its account. */
export const chatSync = (
  chat: LinkedChat,
  since: string,
  env: NodeJS.ProcessEnv,
  chosen: Record<string, string> = {},
): { command: string } | { command: null; line: string; why: string } | null => {
  const tool = TOOLS[chat.provider]
  if (!tool) return null
  const found = profileFor(chat.provider, chat.account, env, chosen)
  const target = chat.chat.startsWith("-")
    ? `--since-time ${since} -- ${chat.chat}`
    : `${chat.chat} --since-time ${since}`
  const line = (profile: string) => `${tool.tool} ${profile} messages sync ${target}`
  if (found && "profile" in found) return { command: line(found.profile) }
  return { command: null, line: line("<profile>"), why: found?.why ?? "no profile" }
}

/** `chatSync` as the plain text says it. */
export const syncHint = (
  chat: LinkedChat,
  since: string,
  env: NodeJS.ProcessEnv,
  chosen: Record<string, string> = {},
): string | null => {
  const sync = chatSync(chat, since, env, chosen)
  if (!sync) return null
  return sync.command ?? `${sync.line} (${sync.why})`
}
