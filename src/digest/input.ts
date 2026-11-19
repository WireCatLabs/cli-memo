import { type AgentInput, readOnlyLockOf } from "@wirecat/cli-core/cli"
import { APP } from "../app.js"
import { type CatchUpOptions, catchUp } from "./catch-up.js"
import { DIGEST_AGENDA, isDigest, runsDigestSkill, windowFlags } from "./digests.js"

/** How many past reports the agent compares today's with. */
export const HISTORY_REPORTS = 3

/**
 * What a digest's agent reads before its first turn: the syncs caught up first, then the agenda and the last reports
 * as the skill would fetch them, so it spends its calls on following leads. A read that fails is left out, and the
 * agent fetches it itself.
 */
export const digestInput =
  (env: NodeJS.ProcessEnv, options: CatchUpOptions & { now?: () => number } = {}): AgentInput =>
  async (schedule, run) => {
    if (schedule.kind !== "agent" || !isDigest(env, schedule.name) || !runsDigestSkill(schedule)) return undefined
    // A host under the read-only lock changes nothing, another tool's store included.
    if (readOnlyLockOf(APP, env) === undefined) await catchUp(env, options).catch(() => [])
    const now = (options.now ?? Date.now)()
    const flags = windowFlags(env, schedule.name, schedule.when, now)?.split(" ") ?? []
    const agenda = [...DIGEST_AGENDA, ...flags]
    const history = ["digest", "history", schedule.name, "--last", String(HISTORY_REPORTS), "--compact"]
    const parts: string[] = []
    for (const argv of [agenda, history]) {
      const answer = await run(argv).catch(() => undefined)
      if (answer?.trim()) parts.push(`# memo ${argv.join(" ")}\n\n${answer.trim()}`)
    }
    return parts.length ? `${parts.join("\n\n")}\n` : undefined
  }
