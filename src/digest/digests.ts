import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { basename, join } from "node:path"
import { CliError, resolvePaths, writeSecurely } from "@wirecat/cli-base"
import {
  type Harness,
  harnessOfArgv,
  isCalendar,
  isHarness,
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
  /** The agent that writes it, and the model it was given; null for the agent's own default. */
  harness: Harness | null
  model: string | null
  maxCostUsd: number | null
  /** Why its timer will not start it until you act, and the command that fixes it; null when it runs. */
  needs: string | null
  maxCostPerDayUsd: number
  last: { at: string; ok: boolean; costUsd: number | null; output: string } | null
  nextAt: string | null
}

/** What a digest's agent was asked, as cli-core keeps it beside the argv it rebuilds each run from. */
export interface DigestAgent {
  harness: Harness
  model: string
  maxCost?: number
  allowDangerous?: true
}

export const agentOf = (schedule: Schedule): DigestAgent | undefined => {
  const { agent } = schedule
  if (agent === undefined || !isHarness(agent.harness)) return undefined
  return {
    harness: agent.harness,
    model: agent.model,
    ...(agent.maxCost === undefined ? {} : { maxCost: agent.maxCost }),
    ...(agent.allowDangerous ? { allowDangerous: true } : {}),
  }
}

/** Whether the schedule runs memo's digest skill, not a prompt of its own made with `memo schedule agent`. */
export const runsDigestSkill = (schedule: Schedule): boolean =>
  schedule.agent ? schedule.agent.prompt === DIGEST_PROMPT : schedule.argv.includes(DIGEST_PROMPT)

const ONE_TOKEN_FLAGS = new Set(["--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands"])
const FIXED_VALUE_FLAGS: Record<string, string> = {
  "--permission-mode": "dontAsk",
  "--tools": "Bash",
  "--setting-sources": "",
}
const MODEL = /^[A-Za-z0-9][\w.:/@[\]-]*$/

/**
 * A digest saved before cli-core kept `agent`, read back only when its argv is exactly the shape memo's claude digest
 * had: a run may have rewritten that file (SEC-1), so anything else is left for the owner rather than carried over.
 */
export const legacyClaudeDigest = (argv: readonly string[], tools: readonly string[]): DigestAgent | undefined => {
  const program = basename(argv[0] ?? "")
    .replace(/\.(exe|cmd)$/i, "")
    .toLowerCase()
  if (program !== "claude" || argv[1] !== "-p" || argv[2] !== DIGEST_PROMPT) return undefined
  let model = ""
  let maxCost: number | undefined
  for (let at = 3; at < argv.length; at++) {
    const flag = argv[at] ?? ""
    const value = argv[at + 1]
    if (ONE_TOKEN_FLAGS.has(flag)) continue
    if (flag in FIXED_VALUE_FLAGS && value === FIXED_VALUE_FLAGS[flag]) {
      at++
      continue
    }
    if (flag === "--model" && value !== undefined && MODEL.test(value)) {
      model = value
      at++
      continue
    }
    if (flag === "--max-budget-usd" && Number(value) > 0 && Number.isFinite(Number(value))) {
      maxCost = Number(value)
      at++
      continue
    }
    if (flag === "--allowedTools" && tools.includes(value ?? "")) {
      while (tools.includes(argv[at + 1] ?? "")) at++
      continue
    }
    return undefined
  }
  return { harness: "claude", model, ...(maxCost === undefined ? {} : { maxCost }) }
}

/** Why a digest will not run until the owner acts, with the command that fixes it, or null. */
export const needsOf = (name: string, schedule: Schedule): string | null => {
  if (schedule.kind !== "agent") return null
  const agent = agentOf(schedule)
  if (agent) return null
  if (harnessOfArgv(schedule.argv) === "codex")
    return `codex runs on a schedule only with your consent: \`memo digest edit ${name} --agent codex --allow-dangerous\``
  return `saved by an older memo in a shape memo does not re-save by itself; check it, then \`memo digest edit ${name} --agent claude\``
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
    harness: (schedule && (agentOf(schedule)?.harness ?? harnessOfArgv(schedule.argv))) || null,
    model: (schedule && agentOf(schedule)?.model) || null,
    maxCostUsd: (schedule && agentOf(schedule)?.maxCost) ?? null,
    needs: schedule ? needsOf(name, schedule) : null,
    maxCostPerDayUsd: schedule?.maxCostPerDay ?? limits.maxCostPerDay ?? SCHEDULE_DEFAULTS.maxCostPerDay,
    last: last ? { at: last.at, ok: last.exitCode === 0, costUsd: last.costUsd ?? null, output: last.output } : null,
    nextAt: next === undefined ? null : new Date(next).toISOString(),
  }
}
