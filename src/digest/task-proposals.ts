import type { MessageStore } from "@wirecat/cli-core/store"
import { listReview, type ReviewItem } from "../review/review.js"
import { type Scheduled, schedulesOf } from "./sync-health.js"
import { digestSchedule } from "./tasks.js"

/** The proposal kinds whose batches carry task findings: mail, meetings, and an agent's cited findings. */
export const TASK_BATCH_KINDS = ["mail_findings", "meeting_findings", "findings"] as const

export const REVIEW_TASKS = `wcat review list kind:${TASK_BATCH_KINDS.join(",")}`

const MOST_PAGES = 20

/** The task findings of a batch still waiting for the owner. */
export const waitingTasks = (row: Pick<ReviewItem, "parts">): number =>
  (row.parts ?? []).filter((part) => part.kind === "task" && part.outcome === null).length

/**
 * Every waiting batch with a task in it, newest first, and how many tasks they hold. Identity links and other
 * proposals outnumber them many times over, so the agenda reads these on their own rather than from the newest page.
 */
export const taskProposals = async (store: MessageStore, env: NodeJS.ProcessEnv) => {
  const batches: ReviewItem[] = []
  for (let page = 1; page <= MOST_PAGES; page++) {
    const found = await listReview(store, env, [`kind:${TASK_BATCH_KINDS.join(",")}`], { limit: 50, page })
    for (const row of found.items) if (waitingTasks(row) > 0) batches.push(row)
    if (!found.hasMore) break
  }
  return { batches, tasks: batches.reduce((sum, row) => sum + waitingTasks(row), 0) }
}

/** The agents that propose tasks, each with the sources it reads and the command that schedules it. */
export const TASK_AGENTS = [
  {
    skill: "mail-triage",
    reads: "mail",
    add: "wcat schedule agent mail-triage claude 'Run wcat skill show mail-triage and follow it.' --every 5m --on-new-mail mail-triage --max-cost 1",
  },
  {
    skill: "task-triage",
    reads: "messengers",
    add: "wcat schedule agent task-triage claude 'Run wcat skill show task-triage and follow it.' --at 08:00 --at 13:00 --at 18:00 --max-cost 1",
  },
] as const

export type TaskAgent = (typeof TASK_AGENTS)[number]

const STOPPED = new Set(["agent.refused", "cost.day-cap"])

const scheduleOf = (env: NodeJS.ProcessEnv, skill: string): Scheduled | undefined => {
  const all = schedulesOf(digestSchedule(env).state)
  return (
    all.find((one) => one.name === skill) ??
    all.find((one) => one.kind === "agent" && one.argv.join(" ").includes(`wcat skill show ${skill}`))
  )
}

/**
 * A note for each agent that should propose tasks and does not: none scheduled, paused, failing, or left out by its
 * timer. Without it a quiet agenda reads as "nothing to do" while no agent read the sources at all.
 */
export const taskAgentNotes = (env: NodeJS.ProcessEnv, wanted: readonly TaskAgent[]): string[] =>
  wanted.flatMap((agent) => {
    const schedule = scheduleOf(env, agent.skill)
    if (!schedule) return [`# no agent proposes tasks from ${agent.reads}; add one: ${agent.add}`]
    const name = schedule.name
    if (schedule.paused)
      return [`# ${name} is paused, so ${agent.reads} propose no tasks: wcat schedule resume ${name}`]
    const { last } = schedule
    const skipped = last?.skipped
    if (skipped && STOPPED.has(skipped.reason ?? "") && (last === undefined || skipped.at >= last.at))
      return [
        `# ${name} has not run since ${last?.at ?? "it was added"}: ${skipped.why}` +
          (skipped.reason === "agent.refused" ? `; save it again: ${agent.add}` : ""),
      ]
    if (last && last.exitCode !== 0)
      return [`# ${name} fails since ${last.failingSince ?? last.at}: wcat schedule list`]
    return []
  })
