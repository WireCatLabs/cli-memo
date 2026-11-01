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
    return `Create ${what}${target === null ? "" : ` ${action.kind === EVIDENCE_FINDINGS_KIND ? "in" : "from"} ${target}`}`
  }
  const words = action.kind.replaceAll("_", " ")
  const text = [payload.text, payload.title].find((one): one is string => typeof one === "string" && one.trim() !== "")
  return [
    `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
    target === null ? "" : ` ${target}`,
    text === undefined ? "" : `: ${clip(text)}`,
  ].join("")
}

const fingerprintOf = async (store: MessageStore, action: ProposedAction) => {
  try {
    if (action.kind === EVIDENCE_FINDINGS_KIND) return (await store.evidenceFindings.get(action.id)).fingerprint
    if (action.kind === MEETING_FINDINGS_KIND && action.account)
      return (await store.meetingFindings.get(action.account, action.id)).fingerprint
  } catch {
    // A batch over the read budget, or stored by a newer build, still lists; it is decided where it is shown in full.
  }
  return null
}

/** Project names by reference, read once for a whole answer. */
const projectNames = async (store: MessageStore, actions: readonly ProposedAction[]) =>
  actions.some((action) => action.target?.startsWith("project:"))
    ? new Map((await store.knowledge.projects()).map((project) => [project.ref, project.name]))
    : new Map<string, string>()

/**
 * An action as memo answers it: what it would do in a sentence, the project it is about with its name, and for a
 * findings batch the fingerprint a decision needs and, unless brief, each cited source read back.
 */
export const actionItems = async (
  store: MessageStore,
  actions: readonly ProposedAction[],
  { brief = false }: { brief?: boolean } = {},
) => {
  const names = await projectNames(store, actions)
  return Promise.all(
    actions.map(async (action) => {
      const project = action.target?.startsWith("project:") ? action.target : null
      const projectName = project === null ? null : (names.get(project) ?? null)
      const findings = action.kind === EVIDENCE_FINDINGS_KIND || action.kind === MEETING_FINDINGS_KIND
      return {
        ...action,
        summary: summaryOf(action, projectName),
        project,
        projectName,
        ...(findings ? { fingerprint: await fingerprintOf(store, action) } : {}),
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
