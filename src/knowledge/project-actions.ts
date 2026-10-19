import { CliError } from "@wirecat/cli-base"
import type { FindingsInput } from "@wirecat/cli-core/meetings"
import { contextEvidenceFingerprint, excerpt, storedNeighbours } from "@wirecat/cli-core/services"
import type { Author, EvidenceFindingsBatch, MessageStore, Project } from "@wirecat/cli-core/store"
import { loadConfig } from "../config.js"
import { keyDocuments } from "./key-documents.js"

export interface ContextWindow {
  brief: boolean
  before: number
  after: number
}

/** What a reviewer reads to decide one cited reference: the text now, whether it changed, and its neighbours. */
const evidenceContext = async (
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
      : fingerprint === null || contextEvidenceFingerprint(record) === fingerprint
        ? "unchanged"
        : "changed"
  if (window.brief || !record) return { reference: ref, state }
  const around =
    window.before + window.after === 0
      ? []
      : await storedNeighbours(store)
          .around(ref, window)
          .catch(() => [])
  return {
    reference: ref,
    state,
    title: record.title,
    text: excerpt(record.text, words, 400),
    around: around.map((one) => ({ ...one, text: excerpt(one.text, words, 200) })),
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
          (await keyDocuments(store, project))
            .filter((key) => !key.confirmed)
            .map(async (key) => ({
              kind: "key_document" as const,
              id: `key:${key.id}`,
              status: "proposed" as const,
              reason: key.reason,
              provenance: key.provenance,
              evidence: [await evidenceContext(store, key.ref, null, key.reason ?? "", options)],
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

/** The owner decides; an agent decides for the owner only with a reason, and only while the owner allows it. */
export const deciderOf = (env: NodeJS.ProcessEnv, author: Author, reason: string | undefined) => {
  if (author === "owner") return "owner" as const
  if (loadConfig(env).agent_decisions === false)
    throw new CliError(
      "permission_error",
      "the owner turned agent decisions off (agent_decisions: false); ask the owner to decide",
      { reason: "projects.agent-decisions-off" },
    )
  if (!reason?.trim())
    throw new CliError("validation_error", "an agent deciding for the owner gives --reason", {
      param: "reason",
    })
  return { bot: author.bot, ...(author.model === undefined ? {} : { model: author.model }), reason: reason.trim() }
}

/** `key:<id>` is a suggested key document; a number is a findings batch. */
export const decideAction = async (
  store: MessageStore,
  project: Project,
  id: string,
  decision: { confirm: boolean; fingerprint?: string; accept: string[]; by: ReturnType<typeof deciderOf> },
) => {
  const key = /^key:([1-9]\d*)$/.exec(id)?.[1]
  if (key !== undefined) {
    const held = (await keyDocuments(store, project)).find((one) => String(one.id) === key)
    if (!held) throw new CliError("not_found", `no suggested key document ${id} in ${project.ref}`)
    // Notes links have no confirm of their own: the suggestion is replaced by a confirmed link with the decider.
    await store.notes.removeLink(key)
    if (decision.confirm)
      await store.notes.addLink({
        from: held.ref,
        to: project.ref,
        kind: "related-to",
        role: "key",
        ...(held.reason === null ? {} : { evidence: held.reason }),
        ...(decision.by === "owner"
          ? { origin: "owner" as const }
          : {
              origin: "suggested" as const,
              confirmed: true,
              provenance: `agent:${decision.by.bot} for the owner: ${decision.by.reason}`,
            }),
      })
    return { id, kind: "key_document", ref: held.ref, confirmed: decision.confirm, decided_by: decision.by }
  }
  if (!/^[1-9]\d*$/.test(id)) throw new CliError("validation_error", "an action ID is a batch number or key:<id>")
  const batch = await store.evidenceFindings.get(id)
  if (batch.project !== project.ref) throw new CliError("not_found", `findings batch ${id} is about another project`)
  if (decision.fingerprint === undefined)
    throw new CliError("validation_error", "a findings batch needs the --fingerprint shown in projects actions list", {
      param: "fingerprint",
    })
  return store.evidenceFindings.review(id, {
    fingerprint: decision.fingerprint,
    accept: decision.confirm ? decision.accept : [],
    by: decision.by,
  })
}
