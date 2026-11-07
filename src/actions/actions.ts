import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { parseLocator } from "@wirecat/cli-core"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import { MEETING_FINDINGS_KIND } from "@wirecat/cli-core/meetings"
import { proposalRegistry } from "@wirecat/cli-core/services"
import {
  type Author,
  type Decider,
  EVIDENCE_FINDINGS_KIND,
  MAIL_FINDINGS_KIND,
  type MessageStore,
  PROPOSAL_STATUSES,
  type ProposedAction,
} from "@wirecat/cli-core/store"
import { pageOf } from "../page.js"
import { decisionOf } from "../review/review.js"
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

const isBatch = (action: ProposedAction) =>
  action.kind === EVIDENCE_FINDINGS_KIND || action.kind === MEETING_FINDINGS_KIND

/**
 * The parts a reader composes its own line from, in its own language: what it would do, to what by name, the
 * payload's whole text, and how many facts and tasks a findings batch would create.
 */
const partsOf = (action: ProposedAction, targetName: string | null) => {
  const payload = (action.payload ?? {}) as { text?: unknown; title?: unknown; findings?: { kind?: unknown }[] }
  if (isBatch(action)) {
    const findings = Array.isArray(payload.findings) ? payload.findings : []
    const facts = findings.filter((one) => one.kind === "fact").length
    return { verb: "create", targetName, text: null, counts: { facts, tasks: findings.length - facts } }
  }
  const text = [payload.text, payload.title].find((one): one is string => typeof one === "string" && one.trim() !== "")
  return { verb: action.kind, targetName, text: text ?? null }
}

/** The same parts as one English line, for a terminal or an agent. */
const summaryOf = (action: ProposedAction, parts: ReturnType<typeof partsOf>) => {
  const target = parts.targetName ?? action.target
  if ("counts" in parts && parts.counts) {
    const { facts, tasks } = parts.counts
    const what = [facts && counted(facts, "fact"), tasks && counted(tasks, "task")].filter(Boolean).join(" and ")
    const word = action.kind === MEETING_FINDINGS_KIND ? "from" : action.target?.startsWith("project:") ? "in" : "about"
    return `Create ${what || "nothing"}${target === null ? "" : ` ${word} ${target}`}`
  }
  const words = parts.verb.replaceAll("_", " ")
  return [
    `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
    target === null ? "" : ` ${target}`,
    parts.text === null ? "" : `: ${clip(parts.text)}`,
  ].join("")
}

/** A message's or chat's reference names its chat; `undefined` for any other reference. */
const chatOf = (reference: string) => {
  if (!reference.startsWith("msg:") && !reference.startsWith("chat:")) return undefined
  try {
    const at = parseLocator(reference)
    return { key: { provider: at.provider, account: at.account }, chat: at.chat }
  } catch {
    return undefined
  }
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

/** What memo calls each target: a project, person, task, or the chat of a message; read once for a whole answer. */
const targetNames = async (store: MessageStore, actions: readonly ProposedAction[]) => {
  const names = new Map<string, string>()
  const chats = new Map<string, string>()
  if (actions.some((action) => action.target?.startsWith("project:")))
    for (const project of await store.knowledge.projects()) names.set(project.ref, project.name)
  for (const target of new Set(actions.flatMap((action) => action.target ?? []))) {
    if (target.startsWith("person:")) {
      const person = await store.people.personByUid(target.slice(7))
      if (person?.name) names.set(target, person.name)
    } else if (target.startsWith("task:")) {
      const task = await store.tasks.details(target.slice(5)).catch(() => undefined)
      if (task) names.set(target, task.title)
    } else {
      const chat = chatOf(target)
      const title = chat && (await store.chats.chatTitle(chat.key, chat.chat).catch(() => null))
      if (title) {
        names.set(target, title)
        chats.set(target, title)
      }
    }
  }
  return { names, chats }
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
  const batches = await Promise.all(actions.map((action) => (isBatch(action) ? batchOf(store, action) : undefined)))
  const { names, chats } = await targetNames(store, actions)
  for (const batch of batches)
    if (batch?.project && !names.has(batch.project))
      for (const project of await store.knowledge.projects()) names.set(project.ref, project.name)
  return Promise.all(
    actions.map(async (action, at) => {
      const batch = batches[at]
      const project = batch?.project ?? (action.target?.startsWith("project:") ? action.target : null)
      const projectName = project === null ? null : (names.get(project) ?? null)
      const targetName = action.target === null ? null : (names.get(action.target) ?? null)
      const parts = partsOf(action, targetName)
      return {
        ...action,
        summary: summaryOf(action, parts),
        ...parts,
        chatName: action.target === null ? null : (chats.get(action.target) ?? null),
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
  options: { brief?: boolean; keep?: (rows: ProposedAction[]) => Promise<ProposedAction[]> } = {},
) => {
  const status = queryTerms(query, ACTION_QUERY, "actions list").get("status") as ProposedAction["status"] | undefined
  const { keep = async (rows) => rows, ...shown } = options
  // Under the group lock only the group's actions are listed; a page may then hold fewer than asked.
  return pageOf("actions list", limit, async (most) =>
    actionItems(
      store,
      await keep(await store.proposedActions.list({ limit: most, ...(status === undefined ? {} : { status }) })),
      shown,
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
 * The batches `actions confirm` and `reject` decide part by part. An evidence batch needs the fingerprint its reader
 * saw; a mail batch checks one when given, since the owner may decide it from `review` without one.
 */
const BATCHES: Record<
  string,
  { fingerprint: (store: MessageStore, id: string) => Promise<string>; stale: string; required: boolean }
> = {
  [EVIDENCE_FINDINGS_KIND]: {
    fingerprint: async (store, id) => (await store.evidenceFindings.get(id)).fingerprint,
    stale: "evidence-findings.stale",
    required: true,
  },
  [MAIL_FINDINGS_KIND]: {
    fingerprint: async (store, id) => (await store.mailFindings.get(id)).fingerprint,
    stale: "mail-findings.stale",
    required: false,
  },
}

/**
 * A findings batch decided by its id alone, whatever it is about; `undefined` for any other action, which the generic
 * confirm and reject handle.
 */
export const decideFindings = async (
  store: MessageStore,
  id: string,
  decision: Decision & { accept: string[]; confirm: boolean; by: Decider },
) => {
  const batch = BATCHES[(await store.proposedActions.get(id)).kind]
  if (!batch) {
    if (decision.accept.length || decision.fingerprint !== undefined)
      throw new CliError("validation_error", "finding IDs and --fingerprint are for a findings batch")
    return undefined
  }
  if (decision.fingerprint === undefined && batch.required)
    throw new CliError("validation_error", "a findings batch needs the --fingerprint actions show gives", {
      param: "fingerprint",
    })
  await decideBatch(store, id, decision)
  return showAction(store, id)
}

/**
 * A findings batch decided through the review registry. The fingerprint the reviewer read must still be the
 * batch's: the registry takes the stored one, so a changed batch is refused here first.
 */
export const decideBatch = async (
  store: MessageStore,
  id: string,
  decision: { fingerprint?: string; accept: readonly string[]; confirm: boolean; by: Decider; reason?: string },
) => {
  const batch = BATCHES[(await store.proposedActions.get(id)).kind]
  if (!batch) throw new CliError("validation_error", "not a findings batch")
  if (decision.fingerprint !== undefined && (await batch.fingerprint(store, id)) !== decision.fingerprint)
    throw new CliError("validation_error", "the findings changed since they were read; stage a new batch", {
      reason: batch.stale,
    })
  const parts = decision.confirm && decision.accept.length ? decision.accept.map((one) => `${id}/${one}`) : [id]
  const { decided, refused } = await proposalRegistry(store).decide(
    parts,
    decisionOf(decision.confirm, decision.by, decision.reason),
  )
  const refusal = refused[0]
  if (refusal) throw new CliError(refusal.code, refusal.message, { reason: refusal.reason })
  return decided[0]
}

export interface NewProposal extends AccountScope {
  kind: string
  reason: string
  target?: string
  payload?: string
}

/** The account is the one that would act, and the task the proposal becomes on approval lands in its inbox. */
export const propose = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  proposal: NewProposal,
  by: Author,
): Promise<ProposedAction> => {
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
    account: await selectAccount(store, env, proposal),
    reason: proposal.reason,
    ...(proposal.target === undefined ? {} : { target: proposal.target }),
    ...(payload === undefined ? {} : { payload }),
  })
}
