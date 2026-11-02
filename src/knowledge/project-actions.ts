import { CliError } from "@wirecat/cli-base"
import type { FindingsInput } from "@wirecat/cli-core/meetings"
import {
  contextEvidenceFingerprint,
  documentPassage,
  excerpt,
  proposalRegistry,
  storedNeighbours,
} from "@wirecat/cli-core/services"
import type { Decider, EvidenceFindingsBatch, MessageStore, Project } from "@wirecat/cli-core/store"
import { decideBatch } from "../actions/actions.js"
import { decideOne, decisionOf } from "../review/review.js"

export interface ContextWindow {
  brief: boolean
  before: number
  after: number
}

/** What a reviewer reads to decide one cited reference: the text now, whether it changed, and its neighbours. */
export const evidenceContext = async (
  store: MessageStore,
  ref: string,
  fingerprint: string | null,
  words: string,
  window: ContextWindow,
) => {
  const record = await store.contextRecords?.read(ref)
  const state =
    record === null || record === undefined
      ? "missing"
      : fingerprint === null
        ? "untracked"
        : contextEvidenceFingerprint(record) === fingerprint
          ? "unchanged"
          : "changed"
  if (window.brief || !record) return { reference: ref, state }
  const around =
    window.before + window.after === 0
      ? []
      : ref.startsWith("document:")
        ? documentPassage(record.text, words, window).map((one) => ({ ref, ...one }))
        : (
            await storedNeighbours(store)
              .around(ref, window)
              .catch(() => [])
          ).map((one) => ({ ...one, text: excerpt(one.text, words, 200) }))
  return {
    reference: ref,
    state,
    title: record.title,
    text: excerpt(record.text, words, 400),
    around,
  }
}

const findingWords = (finding: FindingsInput["findings"][number]) =>
  finding.kind === "fact" ? finding.statement : `${finding.title} ${finding.reason}`

const findingsItem = async (store: MessageStore, batch: EvidenceFindingsBatch, window: ContextWindow) => ({
  kind: "findings" as const,
  id: batch.id,
  status: batch.status,
  fingerprint: batch.fingerprint,
  author: batch.author,
  key: batch.input.key,
  extractor: batch.input.extractor,
  decided_by: batch.decidedBy,
  decision: batch.receipt?.decision ?? null,
  findings: await Promise.all(
    batch.input.findings.map(async (finding) => ({
      ...finding,
      earlier: batch.previous.find((one) => one.id === finding.id) ?? null,
      outcome: batch.receipt?.items.find((one) => one.id === finding.id) ?? null,
      evidence: await Promise.all(
        finding.evidence.map((one) =>
          evidenceContext(store, one.reference, one.fingerprint, findingWords(finding), window),
        ),
      ),
    })),
  ),
})

/**
 * One project's proposals: the key documents an agent suggested and the findings batches it staged, each with the
 * evidence it cites and, unless brief, the text around it, so a reviewer decides without opening every source.
 */
export const projectActions = async (
  store: MessageStore,
  project: Project,
  options: { status?: "proposed" | "reviewed"; limit: number; page: number } & ContextWindow,
) => {
  const keys =
    options.page === 1 && options.status !== "reviewed"
      ? await Promise.all(
          (
            await proposalRegistry(store).list({
              project: project.ref,
              kinds: ["key_document"],
              status: "proposed",
              limit: 50,
              offset: 0,
            })
          ).items.map(async (row) => ({
            kind: "key_document" as const,
            id: row.id,
            status: "proposed" as const,
            reason: row.reason,
            provenance: row.proposedBy.type === "bot" ? `${row.proposedBy.kind}:${row.proposedBy.name}` : null,
            evidence: [await evidenceContext(store, row.subject, null, row.reason ?? "", options)],
          })),
        )
      : []
  const found = await store.evidenceFindings.list({
    project: project.ref,
    limit: options.limit,
    offset: (options.page - 1) * options.limit,
    ...(options.status === undefined ? {} : { status: options.status }),
  })
  return {
    items: [...keys, ...(await Promise.all(found.items.map((batch) => findingsItem(store, batch, options))))],
    hasMore: found.hasMore,
  }
}

/** A suggested key document (`key:<id>` or its proposal number) or a findings batch, through the review registry. */
export const decideAction = async (
  store: MessageStore,
  project: Project,
  id: string,
  decision: { confirm: boolean; fingerprint?: string; accept: string[]; by: Decider; reason?: string },
) => {
  if (!/^(key:)?[1-9]\d*$/.test(id))
    throw new CliError("validation_error", "an action ID is a batch number or key:<id>")
  const row = await proposalRegistry(store).get(id)
  if (row.project !== project.ref || (row.kind !== "key_document" && row.kind !== "findings"))
    throw new CliError("not_found", `no proposal ${id} in ${project.ref}; memo projects actions list shows them`)
  if (row.kind === "key_document") {
    await decideOne(store, id, decisionOf(decision.confirm, decision.by, decision.reason))
    return { id, kind: "key_document", ref: row.subject, confirmed: decision.confirm, decided_by: decision.by }
  }
  if (decision.fingerprint === undefined)
    throw new CliError("validation_error", "a findings batch needs the --fingerprint shown in projects actions list", {
      param: "fingerprint",
    })
  await decideBatch(store, id, { ...decision, fingerprint: decision.fingerprint })
  return store.evidenceFindings.get(id)
}
