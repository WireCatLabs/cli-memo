import { timezoneOf } from "@wirecat/cli-base/query"
import { listQuery, typedQuery } from "@wirecat/cli-core/cli"
import type { FindingsInput } from "@wirecat/cli-core/meetings"
import type { MessageStore } from "@wirecat/cli-core/store"
import { taskProposals } from "../digest/task-proposals.js"
import { DUPLICATE_REASON, type Duplicate } from "../mail/findings-duplicates.js"
import { TASKS_LIST_QUERY } from "./list.js"

const PAGE = 500

/** A title as two agents may word it differently only in case, accents, spacing and punctuation. */
export const titleKey = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/** Every open task's title and every waiting task finding's, whatever source proposed it, as key → reference. */
const knownTitles = async (store: MessageStore, env: NodeJS.ProcessEnv): Promise<Map<string, string>> => {
  const seen = new Map<string, string>()
  const query = listQuery(typedQuery("state:(open OR todo OR in_progress)"), TASKS_LIST_QUERY, "actions add", {
    defaultField: "text",
  })
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.tasks.board(query, {
      limit: PAGE,
      offset,
      sort: "priority",
      descending: false,
      zone: timezoneOf(),
    })
    for (const task of page.items) if (!seen.has(titleKey(task.title))) seen.set(titleKey(task.title), task.ref)
    if (page.items.length < PAGE || offset + PAGE >= page.total) break
  }
  for (const batch of (await taskProposals(store, env)).batches)
    for (const part of batch.parts ?? [])
      if (part.kind === "task" && part.outcome === null && !seen.has(titleKey(part.summary)))
        seen.set(titleKey(part.summary), `proposal:${batch.id}`)
  return seen
}

/**
 * The batch without the tasks already open or already waiting for the owner under the same title, from this source
 * or another: a promise made in a chat and repeated by mail is one task, and a run that reads the same messages again
 * stages nothing new. Facts and payments pass through.
 */
export const withoutTaskDuplicates = async <T extends Pick<FindingsInput, "findings" | "key">>(
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  input: T,
): Promise<{ input: T; duplicates: Duplicate[] }> => {
  if (!input.findings.some((finding) => finding.kind === "task")) return { input, duplicates: [] }
  const seen = await knownTitles(store, env)
  // A retry of a staged batch matches its own tasks; the store answers it with that batch, so it passes whole.
  const keys = new Map<string, unknown>()
  const ownBatch = async (held: string) => {
    if (!held.startsWith("proposal:")) return false
    const id = held.slice("proposal:".length)
    if (!keys.has(id)) keys.set(id, ((await store.proposedActions.get(id)).payload as { key?: unknown }).key)
    return keys.get(id) === input.key
  }
  const duplicates: Duplicate[] = []
  const findings: T["findings"] = []
  for (const finding of input.findings) {
    const held = finding.kind === "task" ? seen.get(titleKey(finding.title)) : undefined
    if (held === undefined || (await ownBatch(held))) findings.push(finding)
    else duplicates.push({ finding: finding.id, kind: finding.kind, duplicateOf: held, reason: DUPLICATE_REASON })
  }
  return { input: { ...input, findings }, duplicates }
}
