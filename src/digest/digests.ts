import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { CliError, resolvePaths, writeSecurely } from "@wirecat/cli-base"
import {
  type Harness,
  harnessOfArgv,
  isCalendar,
  lastRun,
  nextRun,
  previousRun,
  readSchedule,
  SCHEDULE_DEFAULTS,
  type Schedule,
  type ScheduleLimits,
  scheduleFile,
  slotsOf,
  WEEKDAYS,
  type Weekday,
  type When,
} from "@wirecat/cli-core/cli"
import type { TemplateAddress } from "@wirecat/cli-core/store"
import { APP } from "../app.js"

/** The digest memo had before digests had names; its files and brief keep their old places. */
export const MORNING_DIGEST = "morning-digest"

/** Every digest's agent runs the one skill; `skill show` adds that digest's window, sources and brief. */
export const DIGEST_PROMPT = "Run memo skill show morning-digest and follow it."

/** What a digest may read, each a part of `review agenda` it can leave out. */
export const DIGEST_SOURCES = [
  "telegram",
  "max",
  "whatsapp",
  "mail",
  "meetings",
  "tasks",
  "drive",
  "calendar",
  "crm",
] as const
export type DigestSource = (typeof DIGEST_SOURCES)[number]

/** What memo keeps of a digest beside its schedule: the schedule holds the times, routes and caps. */
export interface DigestDefinition {
  name: string
  title: string
  /** Empty: every source. */
  sources: DigestSource[]
  createdAt: string
}

const DAY = 86_400_000

const stateOf = (env: NodeJS.ProcessEnv) => resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state

const definitionsDir = (env: NodeJS.ProcessEnv) => join(stateOf(env), "digests")
const definitionFile = (env: NodeJS.ProcessEnv, name: string) => join(definitionsDir(env), `${name}.json`)

export const digestScheduleFile = (env: NodeJS.ProcessEnv, name: string) => scheduleFile(stateOf(env), name)

export const readDefinition = (env: NodeJS.ProcessEnv, name: string): DigestDefinition | undefined => {
  const file = definitionFile(env, name)
  if (!existsSync(file)) return undefined
  const saved = JSON.parse(readFileSync(file, "utf8")) as Partial<DigestDefinition>
  return {
    name,
    title: typeof saved.title === "string" ? saved.title : name,
    sources: (saved.sources ?? []).filter((one): one is DigestSource => DIGEST_SOURCES.includes(one)),
    createdAt: saved.createdAt ?? "",
  }
}

export const writeDefinition = (env: NodeJS.ProcessEnv, definition: DigestDefinition): void => {
  mkdirSync(definitionsDir(env), { recursive: true, mode: 0o700 })
  writeSecurely(definitionFile(env, definition.name), `${JSON.stringify(definition, null, 2)}\n`, 0o600)
}

export const dropDefinition = (env: NodeJS.ProcessEnv, name: string): void =>
  rmSync(definitionFile(env, name), { force: true })

/**
 * A digest while its schedule exists: the morning digest by name, any other while memo keeps its definition too. A
 * definition left behind by `memo schedule remove` is no digest, and `digest add` writes over it.
 */
// A name goes into file paths: only `add`'s shape can name a digest, so `../x` never reaches the disk.
const DIGEST_NAME = /^[a-z0-9][a-z0-9-]*$/

export const isDigest = (env: NodeJS.ProcessEnv, name: string): boolean =>
  DIGEST_NAME.test(name) &&
  existsSync(digestScheduleFile(env, name)) &&
  (name === MORNING_DIGEST || existsSync(definitionFile(env, name)))

/** The digests by name, the morning digest first. */
export const digestNames = (env: NodeJS.ProcessEnv): string[] => {
  const dir = definitionsDir(env)
  const named = existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
    : []
  const all = new Set([MORNING_DIGEST, ...named.sort()])
  return [...all].filter((name) => isDigest(env, name))
}

/** The digest a scheduled run belongs to: the run's own schedule when it is a digest, else the morning digest. */
export const runningDigest = (env: NodeJS.ProcessEnv): string => {
  const scheduled = env[`${APP.envPrefix}_SCHEDULED`]
  return scheduled && isDigest(env, scheduled) ? scheduled : MORNING_DIGEST
}

/** Where a digest's brief is kept: the morning digest's where it always was. */
export const briefAddress = (name: string): TemplateAddress => ({
  key: name === MORNING_DIGEST ? "digest/brief" : `digest/${name}/brief`,
  channel: "text",
  language: "any",
})

/** A digest's times and weekdays as the page shows them; no weekdays is every day. */
export const timesOf = (when: When): { times: string[]; weekdays: Weekday[] } => {
  if (!isCalendar(when)) return { times: [], weekdays: [] }
  const slots = slotsOf(when)
  const times = [...new Set(slots.map((slot) => slot.at))].sort()
  const weekdays = slots.every((slot) => slot.on) ? WEEKDAYS.filter((day) => slots.some((slot) => slot.on === day)) : []
  return { times, weekdays }
}

/**
 * Where a run at `now` starts reading: the digest's time before the one this run belongs to. A daily digest reads a
 * day, a weekly one a week, one at 08:30 and 18:00 since the other time. A digest that repeats by interval reads a day.
 */
export const windowStart = (when: When, now: number): number => {
  if (!isCalendar(when)) return now - DAY
  const current = previousRun(when, now) ?? now
  return previousRun(when, current - 1) ?? current - DAY
}

/** The agenda's flags for a digest's window and sources, as a run and a backfill give them to the agent. */
export const agendaFlags = (since: number, sources: readonly DigestSource[]) =>
  `--since-time ${new Date(since).toISOString()}${sources.length ? ` --source ${sources.join(",")}` : ""}`

export interface DigestView {
  name: string
  title: string
  times: string[]
  weekdays: Weekday[]
  sources: DigestSource[]
  routes: string[]
  brief: string | null
  scheduled: boolean
  /** The agent that writes it, and the model named on its command line; null for the agent's own default. */
  harness: Harness | null
  model: string | null
  maxCostUsd: number | null
  maxCostPerDayUsd: number
  last: { at: string; ok: boolean; costUsd: number | null; output: string } | null
  nextAt: string | null
}

/** The model an agent schedule's argv names after `--model` (`-m` for some agents), or null for its default. */
export const modelOf = (argv: readonly string[]): string | null => {
  const named = argv.indexOf("--model")
  const at = named < 0 ? argv.indexOf("-m") : named
  return at < 0 ? null : argv[at + 1] || null
}

/** The per-run cap an agent schedule was made with (`--max-budget-usd` in claude's argv), or null. */
export const runCapOf = (argv: readonly string[]): number | null => {
  const at = argv.indexOf("--max-budget-usd")
  const cap = at < 0 ? Number.NaN : Number(argv[at + 1])
  return Number.isFinite(cap) ? cap : null
}

/** A digest's schedule, or a not-found refusal that names the command listing them. */
export const digestOf = (env: NodeJS.ProcessEnv, name: string): { file: string; schedule: Schedule } => {
  const file = digestScheduleFile(env, name)
  if (!isDigest(env, name))
    throw new CliError("not_found", `no digest ${name} — \`memo digest list\` names them`, {
      reason: "digest.not-found",
    })
  return { file, schedule: readSchedule(file) }
}

export const viewOf = (
  env: NodeJS.ProcessEnv,
  name: string,
  { brief, limits, now = Date.now() }: { brief: string | null; limits: ScheduleLimits; now?: number },
): DigestView => {
  const definition = readDefinition(env, name)
  const file = digestScheduleFile(env, name)
  const schedule = existsSync(file) ? readSchedule(file) : undefined
  const last = schedule ? lastRun(file) : undefined
  const scheduled = schedule !== undefined && schedule.paused !== true
  const next = scheduled && schedule && isCalendar(schedule.when) ? nextRun(schedule.when, now) : undefined
  return {
    name,
    title: definition?.title ?? (name === MORNING_DIGEST ? "Morning digest" : name),
    ...(schedule ? timesOf(schedule.when) : { times: [], weekdays: [] }),
    sources: definition?.sources ?? [],
    routes: schedule?.to ?? [],
    brief,
    scheduled,
    harness: schedule ? harnessOfArgv(schedule.argv) : null,
    model: schedule ? modelOf(schedule.argv) : null,
    maxCostUsd: schedule ? runCapOf(schedule.argv) : null,
    maxCostPerDayUsd: schedule?.maxCostPerDay ?? limits.maxCostPerDay ?? SCHEDULE_DEFAULTS.maxCostPerDay,
    last: last ? { at: last.at, ok: last.exitCode === 0, costUsd: last.costUsd ?? null, output: last.output } : null,
    nextAt: next === undefined ? null : new Date(next).toISOString(),
  }
}
