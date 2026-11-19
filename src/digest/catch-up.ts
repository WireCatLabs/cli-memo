import { resolvePaths } from "@wirecat/cli-base"
import type { LastRun } from "@wirecat/cli-core/background"
import { MESSENGER_TOOLS, type RunChild, runChild, toolBinary } from "../knowledge/messenger-sync.js"
import { type CatchUpRun, catchUpRuns, writeCatchUp } from "./catch-up-record.js"
import { schedulesOf } from "./sync-health.js"

/** The `mail` CLI as `MAIL_CLI` names it; its syncs run every few minutes, so they are rarely due. */
const TOOLS = [...MESSENGER_TOOLS, { tool: "mail", appName: "mail-cli", envPrefix: "MAIL" }]

/** What the catch-up may take of a digest's run in all; the agent starts after it either way. */
export const CATCH_UP_MS = 4 * 60_000
/** A sync that succeeded this recently is not run again. */
export const FRESH_MS = 60 * 60_000
/** A run record's reason, not an error memo raises. */
const NOT_INSTALLED = "catch-up.not-installed"
/** Leaves a sync time to save its last page and exit before the budget ends. */
const MARGIN_MS = 10_000

/** The schedule's own argv with its `--timeout` set to what is left, so a sync stops in time and keeps its pages. */
export const withTimeout = (argv: readonly string[], seconds: number): string[] => {
  const value = `${seconds}s`
  const at = argv.indexOf("--timeout")
  if (at >= 0 && at + 1 < argv.length) return argv.map((word, index) => (index === at + 1 ? value : word))
  const joined = argv.findIndex((word) => word.startsWith("--timeout="))
  if (joined >= 0) return argv.map((word, index) => (index === joined ? `--timeout=${value}` : word))
  return [...argv, "--timeout", value]
}

const fresh = (run: LastRun | undefined, now: number, freshMs: number) =>
  run !== undefined && run.exitCode === 0 && now - Date.parse(run.at) < freshMs

export interface CatchUpOptions {
  run?: RunChild
  now?: () => number
  budgetMs?: number
  freshMs?: number
}

/**
 * Before a digest reads the store, runs again each sync the owner put on a timer in tg, max, wa and mail, so the
 * digest reads this morning's messages and not the night's. Each runs as its schedule says: its argv, its variables,
 * its profile; memo picks no profile and syncs no account the owner gave no schedule. A sync that succeeded within
 * `freshMs` is left alone; the tools run side by side, a tool's schedules one after another, all within `budgetMs`.
 */
export const catchUp = async (
  env: NodeJS.ProcessEnv,
  { run = runChild, now = Date.now, budgetMs = CATCH_UP_MS, freshMs = FRESH_MS }: CatchUpOptions = {},
): Promise<CatchUpRun[]> => {
  const ends = now() + budgetMs
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), budgetMs)
  const earlier = catchUpRuns(env)
  try {
    const perTool = await Promise.all(
      TOOLS.map(async (tool) => {
        const state = resolvePaths({ appName: tool.appName, prefix: tool.envPrefix, env }).state
        const due = schedulesOf(state).filter(
          (one) =>
            one.kind === "command" &&
            one.argv.includes("sync") &&
            !one.repeats &&
            !fresh(one.last, now(), freshMs) &&
            !fresh(earlier.get(`${tool.appName}/${one.name}`), now(), freshMs),
        )
        const ran: CatchUpRun[] = []
        for (const one of due) {
          // A timer's run has a bare PATH; each schedule keeps the PATH it was made with, as its own timer runs it.
          const childEnv = { ...env, ...one.environment }
          const bin = await toolBinary(tool, childEnv, run)
          if (!bin) {
            ran.push({
              app: tool.appName,
              schedule: one.name,
              at: new Date(now()).toISOString(),
              exitCode: 127,
              reason: NOT_INSTALLED,
            })
            continue
          }
          const seconds = Math.floor((ends - now() - MARGIN_MS) / 1000)
          if (stop.signal.aborted || seconds < 10) break
          const done = await run(bin, withTimeout(one.argv, seconds), {
            env: childEnv,
            signal: stop.signal,
          }).catch(() => ({ code: null, stdout: "" }))
          ran.push({
            app: tool.appName,
            schedule: one.name,
            at: new Date(now()).toISOString(),
            exitCode: done.code ?? 1,
            ...(done.code === 0 ? {} : { reason: stop.signal.aborted ? "catch-up.budget" : `exit ${done.code}` }),
          })
        }
        return ran
      }),
    )
    const runs = perTool.flat()
    writeCatchUp(env, runs)
    return runs
  } finally {
    clearTimeout(timer)
  }
}
