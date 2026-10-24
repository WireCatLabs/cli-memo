import { type QueryRegistry, queryFieldsOf } from "@wirecat/cli-base/query"
import * as v from "valibot"

export const keyDocument = v.strictObject({
  id: v.string(),
  ref: v.string(),
  title: v.nullable(v.string()),
  path: v.nullable(v.string()),
  reason: v.nullable(v.string()),
  available: v.boolean(),
  confirmed: v.boolean(),
  origin: v.picklist(["file", "owner", "suggested", "message"]),
  provenance: v.nullable(v.string()),
  marked_at: v.string(),
})
export const KEY_DOCUMENTS_QUERY: QueryRegistry = {
  entity: "memo_key_document",
  backend: "native",
  fields: queryFieldsOf(keyDocument, { native: ["id"], examples: { id: "id:1" } }).map((field) =>
    field.native ? { ...field, operators: ["term", "phrase"] } : field,
  ),
}
