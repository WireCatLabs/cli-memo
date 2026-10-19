import { parseEvidenceFindingsJson } from "@wirecat/cli-core/cli"
import { MEETING_FACT_TYPES } from "@wirecat/cli-core/meetings"
import { type MessageStore, WORK_TASK_TYPES } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { itemAnswer, listAnswer } from "../answer.js"
import { projectOf } from "../knowledge/key-documents.js"
import { decideAction, deciderOf, projectActions } from "../knowledge/project-actions.js"
import { define } from "./tool.js"

const AGENT = { bot: "memo-mcp" }
const text = v.pipe(v.string(), v.minLength(1))
const project = v.pipe(v.string(), v.minLength(1), v.description("the project's id, project:<id>, key, name or alias"))
const base = {
  id: text,
  project: text,
  evidence: v.pipe(v.array(v.strictObject({ reference: text, fingerprint: text })), v.minLength(1), v.maxLength(8)),
}
const finding = v.variant("kind", [
  v.strictObject({ ...base, kind: v.literal("fact"), type: v.picklist(MEETING_FACT_TYPES), statement: text }),
  v.strictObject({
    ...base,
    kind: v.literal("task"),
    type: v.picklist(WORK_TASK_TYPES),
    title: text,
    reason: text,
    commitment: v.picklist(["explicit", "inferred"]),
    due_at: v.optional(text),
    due_evidence: v.optional(v.array(text)),
    assignee: v.optional(text),
    assignee_evidence: v.optional(v.array(text)),
  }),
])
const count = v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)), 2)

const decide = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  args: { project: string; id: string; findings: string[]; fingerprint?: string; reason: string },
  confirm: boolean,
) =>
  itemAnswer(
    await decideAction(store, await projectOf(store, args.project), args.id, {
      confirm,
      ...(args.fingerprint === undefined ? {} : { fingerprint: args.fingerprint }),
      accept: args.findings,
      by: deciderOf(env, AGENT, args.reason),
    }),
  )

export const projectActionTools = {
  project_actions_add: define({
    title: "Propose project findings",
    description:
      "memo projects actions add: stage cited facts and follow-up tasks about one project from project_evidence. Every reference is a msg: or document: reference with the fingerprint project_evidence gave; a changed text refuses as stale. Omit unknown dates and assignees; supplying one needs its supporting references. Exact retries reuse the key; changed input under it refuses. Creates no facts or tasks until decided.",
    writes: true,
    input: v.object({
      input: v.strictObject({
        schema_version: v.literal(1),
        key: text,
        extractor: text,
        findings: v.pipe(v.array(finding), v.minLength(1), v.maxLength(16)),
      }),
    }),
    run: async (store, { input }) =>
      itemAnswer(await store.evidenceFindings.stage(parseEvidenceFindingsJson(JSON.stringify(input)), AGENT)),
  }),
  project_actions_list: define({
    title: "Review a project's proposals",
    description:
      "memo projects actions list: a project's proposed key documents (id key:<n>) and findings batches (a number), each finding with its cited evidence — whether the text changed since it was cited (state), the text and the messages around it unless brief. Paged by limit and page. Decide what you are confident about with project_actions_confirm or project_actions_reject and a reason; ask the owner about the rest.",
    writes: false,
    input: v.object({
      project,
      status: v.optional(v.picklist(["proposed", "reviewed"]), "proposed"),
      limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 10),
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
      brief: v.optional(v.boolean(), false),
      before_n: count,
      after_n: count,
    }),
    run: async (store, args) => {
      const found = await projectActions(store, await projectOf(store, args.project), {
        status: args.status,
        limit: args.limit,
        page: args.page,
        brief: args.brief,
        before: args.before_n,
        after: args.after_n,
      })
      return listAnswer("projects actions list", {
        items: found.items,
        limit: args.limit,
        page: args.page,
        has_more: found.hasMore,
        args: { project: args.project, status: args.status },
      })
    },
  }),
  project_actions_confirm: define({
    title: "Confirm a project proposal for the owner",
    description:
      "memo projects actions confirm: decide one proposal for the owner when you are confident, with a reason kept with the decision. A key document (key:<n>) is confirmed; a findings batch creates the named findings and rejects its other new ones, and needs the fingerprint project_actions_list gave. Refused when the owner turned agent decisions off; then ask the owner.",
    writes: true,
    input: v.object({
      project,
      id: text,
      findings: v.optional(v.array(text), []),
      fingerprint: v.optional(text),
      reason: text,
    }),
    run: async (store, args, env) => decide(store, env, args, true),
  }),
  project_actions_reject: define({
    title: "Reject a project proposal for the owner",
    description:
      "memo projects actions reject: reject one proposal for the owner when you are confident, with a reason kept with the decision. A key document (key:<n>) is removed; every new finding of a batch is rejected, which needs the fingerprint project_actions_list gave. Refused when the owner turned agent decisions off; then ask the owner.",
    writes: true,
    input: v.object({ project, id: text, fingerprint: v.optional(text), reason: text }),
    run: async (store, args, env) => decide(store, env, { ...args, findings: [] }, false),
  }),
}
