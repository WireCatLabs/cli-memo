import { CliError } from "@wirecat/cli-base"
import { MEETING_FINDINGS_KIND } from "@wirecat/cli-core/meetings"
import {
  type Decided,
  FACT_SUMMARIES,
  type ProposalFilter,
  type ProposalKind,
  type ProposalRegistry,
  type ProposalRow,
  proposalRegistry,
} from "@wirecat/cli-core/services"
import {
  type MeetingFindingsBatch,
  type MessageStore,
  type ProposedAction,
  proposerOfAction,
  type TaskDetails,
} from "@wirecat/cli-core/store"
import { closeTask } from "../tasks/tasks.js"

/**
 * What a row adds beyond cli-core's `ProposalRow`: where it came from, for grouping, and whether only the owner may
 * decide it. `mayDecide` reads `ownerOnly` off the row the registry gets.
 */
export type ReviewRow = ProposalRow & { source?: string | null; ownerOnly?: boolean }

const ownerOnly = (row: ProposalRow, source: string | null): ReviewRow =>
  Object.assign(row, { source, ownerOnly: true })

const STORED_STATUS: Record<ProposedAction["status"], ProposalRow["status"]> = {
  proposed: "proposed",
  approved: "confirmed",
  executed: "confirmed",
  failed: "confirmed",
  rejected: "rejected",
}

const wanted = (row: ProposalRow, filter: ProposalFilter) =>
  ((filter.status ?? "proposed") === "all" || row.status === (filter.status ?? "proposed")) &&
  (filter.project === undefined || row.project === filter.project)

const storedActions = (store: MessageStore, kind: string, filter: ProposalFilter) =>
  store.proposedActions.list({
    kinds: [kind],
    ...((filter.status ?? "proposed") === "proposed" ? { status: "proposed" as const } : {}),
    ...(filter.by === undefined ? {} : { proposedBy: filter.by }),
    limit: Math.min(filter.offset + filter.limit, 500),
  })

const accountName = (action: ProposedAction) =>
  action.account === null ? null : `${action.account.provider}:${action.account.account}`

const meetingRow = (action: ProposedAction, batch: MeetingFindingsBatch): ReviewRow => {
  const findings = batch.input.findings
  const projects = [...new Set(findings.map((one) => ("project" in one ? one.project : undefined)))]
  const outcome = (id: string) => batch.receipt?.items.find((item) => item.id === id)?.status ?? null
  const references = [...new Set(findings.flatMap((finding) => finding.evidence.map((one) => one.reference)))]
  return ownerOnly(
    {
      id: action.id,
      kind: "meeting_findings",
      status: batch.status === "proposed" ? "proposed" : batch.receipt?.accepted.length ? "confirmed" : "rejected",
      project: projects.length === 1 && typeof projects[0] === "string" ? projects[0] : null,
      subject: references[0] ?? `meeting_findings:${action.id}`,
      object: null,
      summary: `${findings.length} finding${findings.length === 1 ? "" : "s"}`,
      proposedBy: proposerOfAction(action),
      reason: action.reason,
      evidence: references.slice(0, 5),
      score: null,
      signals: null,
      parts: findings.map((finding) => ({
        id: finding.id,
        kind: finding.kind,
        summary: FACT_SUMMARIES[finding.kind]?.(finding) ?? finding.kind,
        outcome: outcome(finding.id),
      })),
      createdAt: action.createdAt,
    },
    accountName(action),
  )
}

/**
 * A meeting's cited findings, staged by `meetings actions add`: the same review as `meetings actions confirm`, with
 * the batch's current fingerprint. Owner only, as there.
 */
export const meetingFindingsKind = (store: MessageStore): ProposalKind => {
  const batchOf = async (action: ProposedAction) => {
    if (action.account === null) throw new CliError("not_found", `meeting findings ${action.id} name no account`)
    return { account: action.account, batch: await store.meetingFindings.get(action.account, action.id) }
  }
  return {
    kind: "meeting_findings",
    stored: [MEETING_FINDINGS_KIND],
    parts: true,
    list: async (filter) => {
      const rows: ReviewRow[] = []
      for (const action of await storedActions(store, MEETING_FINDINGS_KIND, filter)) {
        const { batch } = await batchOf(action)
        rows.push(meetingRow(action, batch))
      }
      return rows.filter((row) => wanted(row, filter)).slice(0, filter.offset + filter.limit)
    },
    get: async (id) => {
      const action = await store.proposedActions.get(id)
      return meetingRow(action, (await batchOf(action)).batch)
    },
    decide: async (id, { confirm, by, parts }): Promise<Decided> => {
      const { account, batch } = await batchOf(await store.proposedActions.get(id))
      const turnedDown = new Set(batch.previous.filter((one) => one.status === "rejected").map((one) => one.id))
      const accept = !confirm
        ? []
        : (parts ?? batch.input.findings.map((finding) => finding.id).filter((one) => !turnedDown.has(one)))
      const reviewed = await store.meetingFindings.review(account, id, { fingerprint: batch.fingerprint, accept, by })
      const made = (reviewed.receipt?.items ?? []).flatMap((item) =>
        item.status === "accepted" && item.reference && !item.reused ? [item.reference] : [],
      )
      return { id, kind: "meeting_findings", status: accept.length ? "confirmed" : "rejected", made }
    },
  }
}

/** `msg:telegram/1/77/42` → `telegram`, `1`: the account a task from a message is closed in. */
const accountOfSource = (source: string | null) => {
  const match = /^msg:([a-z][a-z0-9-]*)\/([^/]+)\//.exec(source ?? "")
  return match?.[1] && match[2] ? { provider: match[1], account: decodeURIComponent(match[2]) } : {}
}

const closeRow = (task: TaskDetails): ReviewRow | undefined => {
  const suggestion = task.closeSuggestion
  if (suggestion === null) return undefined
  return ownerOnly(
    {
      id: `close:${task.key}`,
      kind: "task_close",
      status: "proposed",
      project: task.project,
      subject: task.ref,
      object: null,
      summary: `close as ${suggestion.as}: ${task.title}`,
      proposedBy: { type: "bot", id: suggestion.by, name: suggestion.by, kind: "agent" },
      reason: suggestion.reason,
      evidence: task.source === null ? [] : [task.source],
      score: suggestion.certainty,
      signals: null,
      parts: null,
      createdAt: suggestion.at,
    },
    task.project,
  )
}

/**
 * An agent's close of an open task, waiting on the owner (`close_suggested_*`). Confirming closes it as suggested;
 * rejecting clears the suggestion, as `tg tasks reject` does. Its id is `close:<task key>`.
 */
export const taskCloseKind = (store: MessageStore, env: NodeJS.ProcessEnv): ProposalKind => {
  const suggested = async (limit: number) =>
    store.tasks.find({
      status: "open",
      where: { sql: "t.close_suggested_as IS NOT NULL", params: [] },
      limit,
    })
  const taskOf = async (id: string) => {
    const key = id.slice("close:".length)
    const task = await store.tasks.details(key).catch(() => undefined)
    const row = task && closeRow(task)
    if (!task || !row) throw new CliError("not_found", `no close waits on task ${key}`)
    return { task, row }
  }
  return {
    kind: "task_close",
    prefix: "close",
    list: async (filter) => {
      if ((filter.status ?? "proposed") !== "proposed" && filter.status !== "all") return []
      const rows = (await suggested(filter.offset + filter.limit)).flatMap((task) => closeRow(task) ?? [])
      const by = filter.by
      return rows
        .filter((row) => wanted(row, filter))
        .filter(
          (row) =>
            by === undefined ||
            by === "agent" ||
            (typeof by === "object" && row.proposedBy.type === "bot" && row.proposedBy.name === by.bot),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    get: async (id) => (await taskOf(id)).row,
    decide: async (id, { confirm, reason }): Promise<Decided> => {
      const { task } = await taskOf(id)
      const suggestion = task.closeSuggestion
      if (!confirm || suggestion === null) {
        await store.tasks.suggestClose(task.id, null, "owner")
        return { id, kind: "task_close", status: "rejected", made: [] }
      }
      await closeTask(store, env, task.id, {
        ...accountOfSource(task.source),
        as: suggestion.as,
        ...(reason === undefined ? {} : { reason }),
      })
      return { id, kind: "task_close", status: "confirmed", made: [task.ref] }
    },
  }
}

/**
 * The kind M3's mail pipeline stages (`proposed_actions.kind = mail_findings`). Until cli-core ships its contract
 * the batch is listed and kept from the generic action kind, whose confirm would turn it into a task, and nobody
 * may decide it here yet. Once cli-core registers the kind itself, its registration wins: see `reviewRegistry`.
 */
export const MAIL_FINDINGS_KIND = "mail_findings"

const mailFindingsKind = (store: MessageStore): ProposalKind => {
  const rowOf = (action: ProposedAction): ReviewRow =>
    ownerOnly(
      {
        id: action.id,
        kind: MAIL_FINDINGS_KIND,
        status: STORED_STATUS[action.status],
        project: null,
        subject: action.target ?? `${MAIL_FINDINGS_KIND}:${action.id}`,
        object: null,
        summary: MAIL_FINDINGS_KIND,
        proposedBy: proposerOfAction(action),
        reason: action.reason,
        evidence: [],
        score: null,
        signals: null,
        parts: null,
        createdAt: action.createdAt,
      },
      accountName(action),
    )
  return {
    kind: MAIL_FINDINGS_KIND,
    stored: [MAIL_FINDINGS_KIND],
    list: async (filter) =>
      (await storedActions(store, MAIL_FINDINGS_KIND, filter)).map(rowOf).filter((row) => wanted(row, filter)),
    get: async (id) => rowOf(await store.proposedActions.get(id)),
    decide: async () => {
      throw new CliError("validation_error", "this memo cannot decide mail findings yet — memo upgrade", {
        reason: "proposal.kind-unsupported",
      })
    },
  }
}

/** Every kind `memo review` shows, as `kind:` takes them. */
export const REVIEW_KINDS = [
  "relationship",
  "relationship_update",
  "key_document",
  "fact",
  "memory",
  "findings",
  "meeting_findings",
  MAIL_FINDINGS_KIND,
  "task_close",
  "action",
  "invoice",
  "payment",
] as const

/**
 * cli-core's registry with the kinds memo reviews too. A new kind is one more entry here; a kind cli-core
 * registers itself later is kept, and memo's own copy is dropped.
 */
export const reviewRegistry = (store: MessageStore, env: NodeJS.ProcessEnv): ProposalRegistry => {
  const registry = proposalRegistry(store)
  for (const kind of [meetingFindingsKind(store), mailFindingsKind(store), taskCloseKind(store, env)])
    try {
      registry.register(kind)
    } catch (error) {
      if (!(error instanceof CliError) || error.code !== "configuration_error") throw error
    }
  return registry
}
