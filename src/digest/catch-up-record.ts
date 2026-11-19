import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePaths, writeSecurely } from "@wirecat/cli-base"
import type { LastRun } from "@wirecat/cli-core/background"
import { APP } from "../app.js"

/** One sync schedule a digest's catch-up ran, as `<app>/<schedule>`; the tool's own `last.json` never hears of it. */
export interface CatchUpRun {
  app: string
  schedule: string
  at: string
  exitCode: number
  reason?: string
}

const recordFile = (env: NodeJS.ProcessEnv) =>
  join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "digest", "catch-up.json")

export const writeCatchUp = (env: NodeJS.ProcessEnv, runs: readonly CatchUpRun[]): void => {
  if (runs.length === 0) return
  const file = recordFile(env)
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 })
  const kept = new Map([...readRuns(file), ...runs].map((run) => [`${run.app}/${run.schedule}`, run]))
  writeSecurely(file, `${JSON.stringify({ runs: [...kept.values()] }, null, 2)}\n`, 0o600)
}

const readRuns = (file: string): CatchUpRun[] => {
  if (!existsSync(file)) return []
  try {
    const runs = JSON.parse(readFileSync(file, "utf8"))?.runs
    return Array.isArray(runs) ? runs : []
  } catch {
    return []
  }
}

/** The last catch-up run of each schedule, by `<app>/<schedule>`, in the shape a schedule's own last run has. */
export const catchUpRuns = (env: NodeJS.ProcessEnv): Map<string, LastRun> =>
  new Map(
    readRuns(recordFile(env)).map((run) => [
      `${run.app}/${run.schedule}`,
      { at: run.at, exitCode: run.exitCode, output: "", ...(run.reason ? { reason: run.reason } : {}) },
    ]),
  )
