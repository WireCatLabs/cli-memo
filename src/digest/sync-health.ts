import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { configFilePath, resolvePaths } from "@wirecat/cli-base"
import { type LastRun, scheduledRuns, servingProfiles } from "@wirecat/cli-core/background"
import type { AccountKey } from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { messengerToolOf, signedInAccount } from "../knowledge/messenger-sync.js"

export const HEALTH_REASONS = ["sync-failed", "no-schedule", "quiet"] as const
export type HealthReason = (typeof HEALTH_REASONS)[number]

/** One account whose sync needs a look; the shape `wirecat.report/1`'s `health[]` takes. */
export interface Health {
  /** The messenger or mailbox word: `Telegram`, `MAX`, `WhatsApp`, `mail`. */
  source: string
  /** The account's name, username or address; never its raw id. */
  account: string
  reason: HealthReason
  /** `sync-failed`: the first failure in a row. `quiet`: the newest message stored. `no-schedule`: `null`. */
  since: string | null
  staleHours: number
  /** `sync-failed` only: the failure's code and reason id, as the schedule's `last.json` keeps it. */
  failure?: string
  refs: string[]
}

interface Tool {
  appName: string
  envPrefix: string
}

const MAIL: Tool = { appName: "mail-cli", envPrefix: "MAIL" }

export const SOURCE_WORDS: Record<string, string> = {
  telegram: "Telegram",
  max: "MAX",
  whatsapp: "WhatsApp",
  email: "mail",
}

const toolOf = (provider: string): Tool | undefined => (provider === "email" ? MAIL : messengerToolOf(provider))

const stateDirs = (tool: Tool, env: NodeJS.ProcessEnv) =>
  resolvePaths({ appName: tool.appName, prefix: tool.envPrefix, env })

interface Scheduled {
  name: string
  kind: string
  argv: string[]
  environment: Record<string, string>
  last: LastRun | undefined
}

/** A CLI's schedules with their last runs; cli-core exports the last runs, and the schedule file is its documented JSON. */
export const schedulesOf = (state: string): Scheduled[] => {
  const dir = join(state, "schedules")
  if (!existsSync(dir)) return []
  const last = new Map(scheduledRuns(state).map((one) => [one.job, one.last]))
  return readdirSync(dir).flatMap((name) => {
    try {
      const schedule = JSON.parse(readFileSync(join(dir, name, "schedule.json"), "utf8"))
      return [
        {
          name: String(schedule.name),
          kind: String(schedule.kind),
          argv: Array.isArray(schedule.argv) ? schedule.argv.map(String) : [],
          environment: schedule.environment ?? {},
          last: last.get(String(schedule.name)),
        },
      ]
    } catch {
      return []
    }
  })
}

const mailAddress = (profile: string, env: NodeJS.ProcessEnv): unknown => {
  try {
    const config = JSON.parse(readFileSync(configFilePath(stateDirs(MAIL, env).config), "utf8"))
    return config?.profiles?.[profile]?.address
  } catch {
    return undefined
  }
}

const accountOfProfile = (provider: string, tool: Tool, profile: string, env: NodeJS.ProcessEnv): unknown =>
  provider === "email" ? mailAddress(profile, env) : signedInAccount(tool, profile, env)

export interface SyncRuns {
  /** The newest run of each sync schedule that names this account's profile. */
  runs: LastRun[]
  scheduled: boolean
  /** A `serve` keeps it synced live, as WhatsApp's does. */
  serving: boolean
}

/** How each tool keeps an account synced: its scheduled `sync` runs, by the profile each names, and its live serves. */
export const syncRunsOf = (env: NodeJS.ProcessEnv) => {
  const cache = new Map<string, { schedules: Scheduled[]; serving: string[] }>()
  const read = (tool: Tool) => {
    const known = cache.get(tool.appName)
    if (known) return known
    const app = { ...APP, appName: tool.appName, envPrefix: tool.envPrefix }
    const fresh = {
      schedules: schedulesOf(stateDirs(tool, env).state).filter(
        (one) => one.kind === "command" && one.argv.includes("sync"),
      ),
      serving: servingProfiles(app, env),
    }
    cache.set(tool.appName, fresh)
    return fresh
  }
  return (key: AccountKey): SyncRuns => {
    const tool = toolOf(key.provider)
    if (!tool) return { runs: [], scheduled: false, serving: false }
    const { schedules, serving } = read(tool)
    const mine = schedules.filter(
      (one) =>
        accountOfProfile(key.provider, tool, one.environment[`${tool.envPrefix}_PROFILE`] ?? "default", env) ===
        key.account,
    )
    return {
      runs: mine.flatMap((one) => (one.last ? [one.last] : [])),
      scheduled: mine.length > 0,
      serving: serving.some((profile) => accountOfProfile(key.provider, tool, profile, env) === key.account),
    }
  }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** An account that syncs is quiet only after this long without anything new, ... */
export const QUIET_AFTER = 3 * DAY
/** ... and after this many of its usual gaps: 30 days over the chats or threads that moved in them. */
export const QUIET_GAPS = 3

const hours = (from: number, now: number) => Math.max(0, Math.floor((now - from) / HOUR))

/**
 * Why an account's sync needs a look, or `undefined`. "Stored" alone never says it: an account that syncs fine and
 * hears nothing is quiet only when that is long for it.
 */
export const healthOf = (
  sync: SyncRuns,
  activity: { newest: number | null; moved30d: number },
  now: number,
): Pick<Health, "reason" | "since" | "staleHours" | "failure"> | undefined => {
  // One sync that still succeeds, or a live serve, keeps the account fresh whatever another schedule says.
  if (!sync.serving && sync.runs.length > 0 && sync.runs.every((run) => run.exitCode !== 0)) {
    const first = [...sync.runs].sort((a, b) => (a.failingSince ?? a.at).localeCompare(b.failingSince ?? b.at))[0]
    const since = first?.failingSince ?? first?.at ?? new Date(now).toISOString()
    return {
      reason: "sync-failed",
      since,
      staleHours: hours(Date.parse(since), now),
      ...(first?.reason ? { failure: first.reason } : {}),
    }
  }
  if (!sync.scheduled && !sync.serving)
    return {
      reason: "no-schedule",
      since: null,
      staleHours: activity.newest === null ? 0 : hours(activity.newest, now),
    }
  if (activity.newest === null || activity.moved30d === 0) return undefined
  const usual = Math.max(QUIET_AFTER, (QUIET_GAPS * 30 * DAY) / activity.moved30d)
  if (activity.newest < now - usual)
    return { reason: "quiet", since: new Date(activity.newest).toISOString(), staleHours: hours(activity.newest, now) }
  return undefined
}
