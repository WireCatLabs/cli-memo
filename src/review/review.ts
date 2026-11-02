import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { type StepDefinition, stepOf } from "@wirecat/cli-base/standards"
import { queryTerms, type RefSummary, refLabel, termField } from "@wirecat/cli-core/cli"
import {
  type Decided,
  type Decision,
  type ProposalFilter,
  type ProposalRow,
  proposalRegistry,
} from "@wirecat/cli-core/services"
import type { Decider, MessageStore, Proposer } from "@wirecat/cli-core/store"
import { canonicalProject } from "../vocabulary/project.js"

export const REVIEW_KINDS = [
  "relationship",
  "relationship_update",
  "key_document",
  "fact",
  "memory",
  "findings",
  "action",
] as const

const STATUSES = ["proposed", "confirmed", "rejected", "all"] as const

export const REVIEW_QUERY = {
  entity: "memo_proposal",
  backend: "native",
  fields: [
    termField("project", "kw", "project:HRB"),
    termField("kind", "kw", "kind:relationship,fact"),
    termField("by", "kw", "by:agent"),
    termField("status", "enum", "status:proposed", { values: STATUSES }),
  ],
} as const satisfies QueryRegistry

export const filterOf = async (
  store: MessageStore,
  words: readonly string[],
): Promise<Omit<ProposalFilter, "limit" | "offset">> => {
  const terms = queryTerms(words, REVIEW_QUERY, "review")
  const project = terms.get("project")
  const kinds = terms
    .get("kind")
    ?.split(",")
    .map((one) => one.trim())
    .filter(Boolean)
  const unknown = kinds?.find((one) => !(REVIEW_KINDS as readonly string[]).includes(one))
  if (unknown !== undefined)
    throw new CliError("validation_error", `no proposal kind ${unknown}; kinds: ${REVIEW_KINDS.join(", ")}`, {
      param: "kind",
    })
  const by = terms.get("by")
  return {
    ...(project === undefined ? {} : { project: await canonicalProject(store, project) }),
    ...(kinds?.length ? { kinds } : {}),
    ...(by === undefined ? {} : { by: by === "agent" || by === "rule" ? by : { bot: by } }),
    status: (terms.get("status") as (typeof STATUSES)[number] | undefined) ?? "proposed",
  }
}

export const proposerName = (proposer: Proposer) =>
  proposer.type === "bot" ? proposer.name : proposer.type === "person" ? "you" : "unknown"

type Labels = (ref: string | null) => string | null

/** Titles for every ref a page names, read in one batch; a ref the store does not know has none. */
export const labelsFor = async (store: MessageStore, refs: readonly (string | null)[]): Promise<Labels> => {
  const wanted = [...new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref !== ""))]
  const summaries: Map<string, RefSummary> = wanted.length ? await store.refs.summaries(wanted) : new Map()
  return (ref) => {
    if (ref === null) return null
    const summary = summaries.get(ref)
    return summary === undefined || summary.kind === "unknown" || summary.state === "unavailable"
      ? null
      : refLabel(summary)
  }
}

const titleOf = (row: ProposalRow, label: Labels) => {
  const subject = label(row.subject) ?? row.subject
  const object = label(row.object) ?? row.object
  switch (row.kind) {
    case "relationship":
      return `${subject} → ${object}${row.summary ? ` as ${row.summary}` : ""}`
    case "relationship_update":
      return `${subject}: ${row.summary ?? "change"}`
    case "key_document":
      return `${subject} → key document of ${object}`
    case "fact":
      return row.summary === null ? subject : `"${row.summary}"`
    case "findings":
      return `${row.summary ?? "findings"}${row.parts?.length ? `: ${row.parts.map((part) => part.kind).join(" · ")}` : ""}`
    case "action":
      return `${row.summary ?? "action"} ${subject}`
    default:
      return object === null ? subject : `${subject} → ${object}`
  }
}

export const reviewItem = (row: ProposalRow, label: Labels) => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  title: titleOf(row, label),
  project: row.project,
  projectTitle: label(row.project),
  subject: row.subject,
  object: row.object,
  summary: row.summary,
  proposer: proposerName(row.proposedBy),
  proposedBy: row.proposedBy,
  reason: row.reason,
  score: row.score,
  signals: row.signals,
  evidence: row.evidence,
  parts: row.parts,
  createdAt: row.createdAt,
})

export type ReviewItem = ReturnType<typeof reviewItem>

const rowRefs = (row: ProposalRow) => [row.subject, row.object, row.project]

export const listReview = async (
  store: MessageStore,
  words: readonly string[],
  { limit, page }: { limit: number; page: number },
) => {
  const filter = await filterOf(store, words)
  const found = await proposalRegistry(store).list({ ...filter, limit, offset: (page - 1) * limit })
  const label = await labelsFor(store, found.items.flatMap(rowRefs))
  return { items: found.items.map((row) => reviewItem(row, label)), hasMore: found.hasMore }
}

export const showReview = async (store: MessageStore, id: string) => {
  const row = await proposalRegistry(store).get(id)
  const label = await labelsFor(store, [...rowRefs(row), ...row.evidence])
  return {
    ...reviewItem(row, label),
    evidence: row.evidence.map((ref) => ({ ref, title: label(ref) })),
  }
}

/** `17078,17079,17080,fact:5` → `17078-17080,fact:5`: what a confirm step names, short enough to read. */
export const idRanges = (ids: readonly string[]) => {
  const numbers = ids
    .filter((id) => /^\d+$/.test(id))
    .map(Number)
    .sort((a, b) => a - b)
  const spans: string[] = []
  for (let at = 0; at < numbers.length; ) {
    let end = at
    while (end + 1 < numbers.length && numbers[end + 1] === (numbers[end] as number) + 1) end++
    spans.push(end === at ? String(numbers[at]) : `${numbers[at]}-${numbers[end]}`)
    at = end + 1
  }
  return [...spans, ...ids.filter((id) => !/^\d+$/.test(id))].join(",")
}

const CONFIRM_STEP: StepDefinition = {
  id: "review.confirm",
  kind: "command",
  command: "review confirm",
  args: [{ name: "ids", required: true }],
  why: "confirm the {count} listed; review reject <ids> --reason turns one down",
}

const SHOW_STEP: StepDefinition = {
  id: "review.show",
  kind: "command",
  command: "review show",
  args: [{ name: "id", required: true }],
  why: "one proposal with its evidence",
}

export const reviewSteps = (items: readonly ReviewItem[]) => {
  const pending = items.filter((item) => item.status === "proposed")
  const first = pending[0]
  if (first === undefined) return []
  return [
    stepOf(CONFIRM_STEP, {
      args: { ids: idRanges(pending.map((item) => item.id)) },
      values: { count: pending.length },
    }),
    stepOf(SHOW_STEP, { args: { id: first.id } }),
  ]
}

const day = (iso: string) => iso.slice(5, 10)
const cut = (text: string, width: number) => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat
}

/** Two lines a proposal: what it is, then why and the first evidence. */
export const reviewText = (items: readonly ReviewItem[], hasMore: boolean) => {
  if (!items.length) return "nothing waits for a decision"
  const width = items.reduce((most, item) => Math.max(most, item.id.length), 0)
  const lines = items.flatMap((item) => {
    const head = [
      item.id.padEnd(width),
      item.kind,
      cut(item.title, 90),
      ...(item.score === null ? [] : [item.score.toFixed(2)]),
      item.proposer,
      day(item.createdAt),
      ...(item.status === "proposed" ? [] : [item.status]),
    ].join("  ")
    const why = [item.reason && cut(item.reason, 100), item.evidence[0]].filter(Boolean).join(" · ")
    return why ? [head, `${" ".repeat(width)}  ${why}`] : [head]
  })
  return [...lines, `${items.length} shown${hasMore ? ", more with --page" : ""}`].join("\n")
}

export const decidedText = ({
  decided,
  refused,
}: {
  decided: Decided[]
  refused: { id: string; reason: string; message: string }[]
}) =>
  [
    ...decided.map((one) => `${one.status.padEnd(9)} ${one.id}${one.made.length ? ` → ${one.made.join(" ")}` : ""}`),
    ...refused.map((one) => `${"refused".padEnd(9)} ${one.id} · ${one.message} (${one.reason})`),
  ].join("\n") || "nothing decided"

/** An agent's reason already rides in `by`; given twice, a findings batch would keep it twice. */
export const decisionOf = (confirm: boolean, by: Decider, reason?: string): Decision => {
  const why = reason?.trim()
  return { confirm, by, ...(by === "owner" && why ? { reason: why } : {}) }
}

/**
 * An old decide command's one proposal, through the same registry and check as `review confirm`: a refusal is
 * thrown as the error the store would have raised.
 */
export const decideOne = async (store: MessageStore, id: string, decision: Decision): Promise<Decided> => {
  const { decided, refused } = await proposalRegistry(store).decide([id], decision)
  const refusal = refused[0]
  if (refusal) throw new CliError(refusal.code, refusal.message, { reason: refusal.reason })
  return decided[0] as Decided
}
