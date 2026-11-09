import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import { timezoneOf } from "@wirecat/cli-base/query"
import { listQuery, typedQuery } from "@wirecat/cli-core/cli"
import type { AccountKey, MessageStore, TaskDetails } from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { TASKS_LIST_QUERY } from "../tasks/list.js"
import { isDigest, MORNING_DIGEST, runningDigest } from "./digests.js"
import { type Scheduled, schedulesOf } from "./sync-health.js"

export { MORNING_DIGEST as DIGEST_SCHEDULE } from "./digests.js"

const DAY = 86_400_000

/** How many tasks each group link opens; a task both new and overdue counts in both. */
export interface TaskCounts {
  overdue: number
  today: number
  tomorrow: number
  new: number
  newSince: string
  /** Every open task with no due date, however old: the digest lists none of them, so it counts them. */
  undated: number
}

export type TaskGroup = "overdue" | "today" | "tomorrow" | "new"

export interface HotTask {
  task: TaskDetails
  groups: TaskGroup[]
  /** Whoever sent the message the task was found in. */
  askedBy: string | null
  /** Who does it: the task's assignees. */
  for: string | null
}

/**
 * A digest's schedule and the state folder it is under; the run's own digest by default. The morning digest is also
 * found by the skill its agent runs, for a schedule made under another name, but never as a named digest's schedule:
 * those run that skill too.
 */
export const digestSchedule = (
  env: NodeJS.ProcessEnv,
  name = runningDigest(env),
): { state: string; schedule: Scheduled | undefined } => {
  const state = resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state
  const all = schedulesOf(state)
  const schedule =
    all.find((one) => one.name === name) ??
    (name === MORNING_DIGEST
      ? all.find(
          (one) => one.kind === "agent" && one.argv.join(" ").includes(MORNING_DIGEST) && !isDigest(env, one.name),
        )
      : undefined)
  return { state, schedule }
}

/** A run file's time from its name, `2026-11-08T08-30-00Z.report.json`; NaN for any other file. */
export const runTime = (file: string): number => {
  const [, day, hour, minute, second] = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\./.exec(file) ?? []
  return day ? Date.parse(`${day}T${hour}:${minute}:${second}Z`) : Number.NaN
}

/** The times of the digest runs that left a report, oldest first. */
export const digestReportTimes = (env: NodeJS.ProcessEnv): number[] => {
  const { state, schedule } = digestSchedule(env)
  const runs = schedule ? join(state, "schedules", schedule.name, "runs") : undefined
  if (!runs || !existsSync(runs)) return []
  return readdirSync(runs)
    .filter((file) => file.endsWith(".report.json"))
    .map(runTime)
    .filter((at) => !Number.isNaN(at))
    .sort((a, b) => a - b)
}

/** A past day's "new since": the newest digest report before `until`, or a day before it when there is none. */
export const digestRunBefore = (env: NodeJS.ProcessEnv, until: number): string =>
  new Date(digestReportTimes(env).findLast((at) => at < until) ?? until - DAY).toISOString()

/**
 * When the previous digest ran: the last morning-digest run, or, while it fails, the run before the failures began,
 * so nothing created between a good run and a broken one is lost. A day back when no digest ran yet.
 */
export const previousDigestAt = (env: NodeJS.ProcessEnv, now: number): string => {
  const last = digestSchedule(env).schedule?.last
  if (!last) return new Date(now - DAY).toISOString()
  return last.exitCode === 0 ? last.at : (last.failingSince ?? last.at)
}

const dayOf = (zone: string) => {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
  return (ms: number) => format.format(ms)
}

const PAGE = 500

const openAccountTasks = async (store: MessageStore, key: AccountKey): Promise<TaskDetails[]> => {
  const ids: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.knowledge.taskIds(key, { state: "open", limit: PAGE, offset })
    for (const id of page.items) ids.push(id)
    if (!page.hasMore) break
  }
  return Promise.all(ids.map((id) => store.tasks.details(id)))
}

const openProjectTasks = async (store: MessageStore, zone: string): Promise<TaskDetails[]> => {
  const query = listQuery(
    typedQuery("project:* state:(open OR todo OR in_progress)"),
    TASKS_LIST_QUERY,
    "review agenda",
    {
      defaultField: "text",
    },
  )
  const items: TaskDetails[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.tasks.board(query, { limit: PAGE, offset, sort: "priority", descending: false, zone })
    for (const task of page.items) items.push(task)
    if (page.items.length < PAGE || items.length >= page.total) break
  }
  return items
}

const personName = async (store: MessageStore, ref: string | undefined) => {
  if (!ref?.startsWith("person:")) return null
  return (await store.people.personByUid(ref.slice("person:".length)))?.name ?? null
}

/**
 * The digest's tasks: every open task created since the previous digest, whatever its due date, and every open task
 * overdue, due today or due tomorrow by the owner's local day. Account tasks and project tasks alike.
 */
export const gatherTasks = async (
  store: MessageStore,
  keys: readonly AccountKey[],
  { now, newSince, until }: { now: number; newSince: string; until?: number },
): Promise<{ tasks: HotTask[]; counts: TaskCounts; accounts: number }> => {
  const zone = timezoneOf()
  const day = dayOf(zone)
  const today = day(now)
  const tomorrow = day(now + DAY)
  const since = Date.parse(newSince)
  const seen = new Map<string, TaskDetails>()
  let accounts = 0
  for (const key of keys) {
    const held = await openAccountTasks(store, key)
    if (held.length) accounts++
    for (const task of held) seen.set(task.id, task)
  }
  const projects = await openProjectTasks(store, zone)
  if (projects.length) accounts++
  for (const task of projects) seen.set(task.id, task)

  const counts: TaskCounts = { overdue: 0, today: 0, tomorrow: 0, new: 0, newSince, undated: 0 }
  const tasks: HotTask[] = []
  for (const task of seen.values()) {
    if (until !== undefined && Date.parse(task.createdAt) > until) continue
    const groups: TaskGroup[] = []
    const due = task.dueAt === null ? null : day(Date.parse(task.dueAt))
    if (due === null) counts.undated++
    if (due !== null && due < today) groups.push("overdue")
    if (due === today) groups.push("today")
    if (due === tomorrow) groups.push("tomorrow")
    if (Date.parse(task.createdAt) >= since) groups.push("new")
    if (groups.length === 0) continue
    for (const group of groups) counts[group]++
    const assignees = await Promise.all(
      task.assignments.filter((one) => one.role === "assignee").map((one) => personName(store, one.to)),
    )
    tasks.push({
      task,
      groups,
      askedBy: await personName(store, await store.tasks.sourceSender(task.id)),
      for: assignees.filter(Boolean).join(", ") || null,
    })
  }
  return { tasks, counts, accounts }
}
