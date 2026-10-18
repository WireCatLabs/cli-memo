import { parseMeetingFindingsJson } from "@wirecat/cli-core/cli"
import { MEETING_FACT_TYPES } from "@wirecat/cli-core/meetings"
import { WORK_TASK_TYPES } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { itemAnswer, listAnswer } from "../answer.js"
import { theAccount, writeAccount } from "../store/source-list.js"
import { define } from "./tool.js"

const text = v.pipe(v.string(), v.minLength(1))
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
const source = v.pipe(v.string(), v.minLength(1), v.description("one stored meeting account, provider:account"))

export const meetingActionTools = {
  meeting_actions_add: define({
    title: "Propose meeting findings",
    description:
      "Stage cited facts and follow-up tasks for owner review in one explicit account. Use exact cue references and fingerprints from meeting_passage and confirmed project links. Omit unknown dates/assignees; their supporting evidence is required when supplied. Exact retries reuse the batch key; changed input with that key refuses. Creates no facts or numbered tasks. Only the owner can confirm or reject, through the CLI.",
    writes: true,
    input: v.object({
      account: source,
      input: v.strictObject({
        schema_version: v.literal(1),
        key: text,
        extractor: text,
        findings: v.pipe(v.array(finding), v.minLength(1), v.maxLength(16)),
      }),
    }),
    run: async (store, { account, input }, env) => {
      const parsed = parseMeetingFindingsJson(JSON.stringify(input))
      const key = await writeAccount(store, env, { account }, () => {})
      return itemAnswer(await store.meetingFindings.stage(key, parsed, { bot: "memo-mcp" }))
    },
  }),
  meeting_actions_show: define({
    title: "Read a meeting findings preview",
    description:
      "Read a full batch with evidence, earlier decisions and its receipt before owner review. Confirms nothing.",
    writes: false,
    input: v.object({ source, id: text }),
    run: async (store, { source, id }, env) =>
      itemAnswer(await store.meetingFindings.get(await theAccount(store, env, { source }, () => {}), id)),
  }),
  meeting_actions_list: define({
    title: "List meeting findings previews",
    description: "Read proposed or reviewed findings batches in one explicit meeting account. Confirms nothing.",
    writes: false,
    input: v.object({
      source,
      status: v.optional(v.picklist(["proposed", "reviewed"])),
      limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 20),
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000000)), 1),
    }),
    run: async (store, { source, status, limit, page }, env) => {
      const key = await theAccount(store, env, { source }, () => {})
      const found = await store.meetingFindings.list(key, { status, limit, offset: (page - 1) * limit })
      return listAnswer("meetings actions list", {
        items: found.items,
        limit,
        page,
        has_more: found.hasMore,
        args: { source, query: status === undefined ? "" : `status:${status}`, limit },
      })
    },
  }),
}
