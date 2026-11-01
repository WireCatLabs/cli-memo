import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import { MEETING_FINDINGS_KIND } from "@wirecat/cli-core/meetings"
import {
  type Author,
  EVIDENCE_FINDINGS_KIND,
  type MessageStore,
  PROPOSAL_STATUSES,
  type ProposedAction,
} from "@wirecat/cli-core/store"
import { authorOf } from "../author.js"
import { deciderOf } from "../knowledge/project-actions.js"
import { pageOf } from "../page.js"
import { type AccountScope, selectAccount } from "../store/scope.js"

export const ACTION_QUERY = {
  entity: "proposed_action",
  backend: "native",
  fields: [termField("status", "enum", "status:proposed", { values: PROPOSAL_STATUSES })],
} as const satisfies QueryRegistry

const SUMMARY_TEXT = 120

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > SUMMARY_TEXT ? `${flat.slice(0, SUMMARY_TEXT - 1)}…` : flat
}

const counted = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`

/** What the action would do, and to what, in one line a person reads without opening its payload. */
const summaryOf = (action: ProposedAction, targetName: string | null) => {
  const payload = (action.payload ?? {}) as { text?: unknown; title?: unknown; findings?: { kind?: unknown }[] }
  const target = targetName ?? action.target
  if (action.kind === EVIDENCE_FINDINGS_KIND || action.kind === MEETING_FINDINGS_KIND) {
    const findings = Array.isArray(payload.findings) ? payload.findings : []
    const facts = findings.filter((one) => one.kind === "fact").length
    const made = [facts && counted(facts, "fact"), findings.length - facts && counted(findings.length - facts, "task")]
    const what = made.filter(Boolean).join(" and ") || "nothing"
    const word = action.kind === MEETING_FINDINGS_KIND ? "from" : action.target?.startsWith("project:") ? "in" : "about"
    return `Create ${what}${target === null ? "" : ` ${word} ${target}`}`
  }
  const words = action.kind.replaceAll("_", " ")
  const text = [payload.text, payload.title].find((one): one is string => typeof one === "string" && one.trim() !== "")
  return [
    `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
    target === null ? "" : ` ${target}`,
    text === undefined ? "" : `: ${clip(text)}`,
  ].join("")
}

/** The fingerprint a decision needs and, for an evidence batch, the one project its findings name. */
const batchOf = async (store: MessageStore, action: ProposedAction) => {
  try {
    if (action.kind === EVIDENCE_FINDINGS_KIND) {
      const batch = await store.evidenceFindings.get(action.id)
      return { fingerprint: batch.fingerprint, project: batch.project }
    }
    if (action.kind === MEETING_FINDINGS_KIND && action.account)
      return { fingerprint: (await store.meetingFindings.get(action.account, action.id)).fingerprint }
  } catch {
    // A batch over the read budget, or stored by a newer build, still lists; it is decided where it is shown in full.
  }
  return { fingerprint: null }
}

/** Project and person names by reference, read once for a whole answer. */
const targetNames = async (store: MessageStore, actions: readonly ProposedAction[]) => {
  const names = new Map<string, string>()
  if (actions.some((action) => action.target?.startsWith("project:")))
    for (const project of await store.knowledge.projects()) names.set(project.ref, project.name)
  for (const target of new Set(actions.flatMap((action) => action.target ?? [])))
    if (target.startsWith("person:")) {
      const person = await store.people.personByUid(target.slice(7))
      if (person?.name) names.set(target, person.name)
    }
  return names
}

/**
 * An action as memo answers it: what it would do in a sentence, the project it is about with its name, and for a
 * findings batch the fingerprint a decision needs and, unless brief, each cited source read back.
 */
export const actionItems = async (
  store: MessageStore,
  actions: readonly ProposedAction[],
  { brief = false }: { brief?: boolean } = {},
) => {
  const findings = (action: ProposedAction) =>
    action.kind === EVIDENCE_FINDINGS_KIND || action.kind === MEETING_FINDINGS_KIND
  const batches = await Promise.all(actions.map((action) => (findings(action) ? batchOf(store, action) : undefined)))
  const names = await targetNames(store, actions)
  for (const batch of batches)
    if (batch?.project && !names.has(batch.project))
      for (const project of await store.knowledge.projects()) names.set(project.ref, project.name)
  return Promise.all(
    actions.map(async (action, at) => {
      const batch = batches[at]
      const project = batch?.project ?? (action.target?.startsWith("project:") ? action.target : null)
      const projectName = project === null ? null : (names.get(project) ?? null)
      const targetName = action.target === null ? null : (names.get(action.target) ?? null)
      return {
        ...action,
        summary: summaryOf(action, targetName),
        project,
        projectName,
        ...(batch === undefined
          ? {}
          : { fingerprint: batch.fingerprint, subject: action.target, subjectName: targetName }),
        ...(action.kind === EVIDENCE_FINDINGS_KIND && !brief
          ? { sources: await store.evidenceFindings.sources(action.id).catch(() => []) }
          : {}),
      }
    }),
  )
}

/** Proposed actions the store filters by the query's terms; CLI and MCP list through it. */
export const listActions = (
  store: MessageStore,
  query: readonly string[] | string | undefined,
  limit?: number,
  options: { brief?: boolean } = {},
) => {
  const status = queryTerms(query, ACTION_QUERY, "actions list").get("status") as ProposedAction["status"] | undefined
  return pageOf("actions list", limit, async (most) =>
    actionItems(
      store,
      await store.proposedActions.list({ limit: most, ...(status === undefined ? {} : { status }) }),
      options,
    ),
  )
}

export const showAction = async (store: MessageStore, id: string) =>
  (await actionItems(store, [await store.proposedActions.get(id)]))[0]

export interface Decision {
  fingerprint?: string
  reason?: string
  asOwner?: boolean
}

/**
 * A findings batch decided by its id alone, whatever it is about; `undefined` for any other action, which the generic
 * confirm and reject handle.
 */
export const decideFindings = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  id: string,
  decision: Decision & { accept: string[]; confirm: boolean },
) => {
  const action = await store.proposedActions.get(id)
  if (action.kind !== EVIDENCE_FINDINGS_KIND) {
    if (decision.accept.length || decision.fingerprint !== undefined)
      throw new CliError("validation_error", "finding IDs and --fingerprint are for a findings batch")
    return undefined
  }
  if (decision.fingerprint === undefined)
    throw new CliError("validation_error", "a findings batch needs the --fingerprint actions show gives", {
      param: "fingerprint",
    })
  const by = deciderOf(env, authorOf(env, decision.asOwner), decision.reason)
  const batch = await store.evidenceFindings.get(id)
  const accept = !decision.confirm
    ? []
    : decision.accept.length
      ? decision.accept
      : batch.input.findings.map((finding) => finding.id)
  await store.evidenceFindings.review(id, { fingerprint: decision.fingerprint, accept, by })
  return showAction(store, id)
}

export interface NewProposal extends AccountScope {
  kind: string
  reason: string
  target?: string
  payload?: string
}

/** The account is the one that would act, and the task the proposal becomes on approval lands in its inbox. */
export const propose = async (store: MessageStore, proposal: NewProposal, by: Author): Promise<ProposedAction> => {
  let payload: unknown
  if (proposal.payload !== undefined) {
    try {
      payload = JSON.parse(proposal.payload)
    } catch {
      throw new CliError("validation_error", '--payload is JSON, such as {"text":"Friday works"}')
    }
  }
  return store.proposedActions.propose({
    kind: proposal.kind,
    by,
    account: await selectAccount(store, proposal),
    reason: proposal.reason,
    ...(proposal.target === undefined ? {} : { target: proposal.target }),
    ...(payload === undefined ? {} : { payload }),
  })
}
