import { type QueryRegistry, queryFieldsOf } from "@wirecat/cli-base/query"
import * as v from "valibot"

export const mailRule = v.looseObject({
  id: v.optional(v.number()),
  match: v.record(v.string(), v.unknown()),
  action: v.picklist(["keep", "envelope", "skip"]),
  tags: v.optional(v.array(v.string())),
  reason: v.optional(v.string()),
  protected: v.optional(v.boolean()),
  source: v.optional(v.string()),
  decided_at: v.string(),
})
export const MAIL_RULES_QUERY: QueryRegistry = {
  entity: "memo_mail_rule",
  backend: "sql",
  fields: queryFieldsOf(mailRule, {
    native: ["id", "protected", "source"],
    examples: { id: "id:1", protected: "protected:true", source: "source:owner" },
  }),
}
export const mailRun = v.strictObject({
  id: v.string(),
  started_at: v.string(),
  ended_at: v.nullable(v.string()),
  trashed: v.number(),
  restored: v.number(),
  restorable_until: v.string(),
})
export const MAIL_RUNS_QUERY: QueryRegistry = {
  entity: "memo_mail_run",
  backend: "native",
  fields: queryFieldsOf(mailRun, { native: ["id"], examples: { id: "id:example" } }).map((field) =>
    field.native ? { ...field, operators: ["term", "phrase"] } : field,
  ),
}
