import { annotate } from "@wirecat/cli-base/commands"
import {
  defineQuery,
  type FieldSpec,
  type FieldType,
  fieldsHelp,
  fieldsNamed,
  OPERATORS_BY_TYPE,
  type Predicate,
  parseLucene,
  QUERY_LIMITS,
  type QueryNode,
  type QueryRegistry,
  queryError,
  validateQuery,
} from "@wirecat/cli-base/query"
import type { Command } from "commander"
import * as v from "valibot"

const GUIDE = "https://github.com/WireCatLabs/cli-core/blob/main/docs/search/query-language.md"

/** A field the store filters by itself, named as in the entity; it compares whole values only. */
export const queryField = (
  name: string,
  type: FieldType,
  example: string,
  more: Pick<FieldSpec, "values" | "relation"> = {},
): FieldSpec => ({
  name,
  type,
  operators: OPERATORS_BY_TYPE[type].filter((operator) => operator === "term" || operator === "phrase"),
  example,
  native: true,
  ...more,
})

/** The fields a list filters by: on a store-filtered (`native`) list, only those its store takes. */
const askable = (registry: QueryRegistry) =>
  registry.backend === "native" ? registry.fields.filter((field) => field.native) : registry.fields

/**
 * A list narrowed by one query: `[query...]` last, a Fields section in its help, and the query and entity in
 * `commands --json`. An old filter flag stays an unknown option, so it fails rather than reads as a word.
 * `answersEntity: false` for a list whose rows are memo's own shape, not the entity's.
 */
export const withQuery = (command: Command, registry: QueryRegistry, { answersEntity = true } = {}): Command => {
  const query = defineQuery(registry)
  annotate(command, { query, ...(answersEntity ? { output: { entity: registry.entity } } : {}) })
  return command
    .argument("[query...]", "field:value terms that narrow the list — the fields are below")
    .addHelpText("after", `\n${fieldsHelp({ ...query, fields: askable(query) }, GUIDE)}`)
}

/**
 * The terms of a list's query, each field once and joined by AND, with each default whose field it does not name.
 * The store filters by these in SQL; a question it cannot ask is refused rather than answered from part of the list.
 */
export const queryTerms = (
  words: readonly string[] | string | undefined,
  registry: QueryRegistry,
  command: string,
): Map<string, string> => {
  const text = typeof words === "string" ? words : (words ?? []).join(" ")
  const context = { command, guide: GUIDE }
  const typed = text.trim() === "" ? undefined : parseLucene(text, { defaultField: "none", ...context })
  if (typed) validateQuery(typed, registry, context)
  const named = typed ? fieldsNamed(typed) : new Set<string>()
  const terms = new Map<string, string>()
  const add = (node: QueryNode) => {
    if (node.kind !== "predicate" || (node.operator !== "term" && node.operator !== "phrase"))
      queryError(
        "query.unsupported-placement",
        node.span,
        "this list takes only field:value terms joined by AND",
        context,
      )
    if (terms.has(node.field))
      queryError("query.unsupported-placement", node.span, `${node.field} only once here`, context)
    const { value } = node as Predicate
    const enumerated = registry.fields.find(({ name }) => name === node.field)?.type === "enum"
    terms.set(node.field, enumerated ? value.toLowerCase() : value)
  }
  if (typed?.root.kind === "boolean")
    for (const clause of typed.root.clauses) {
      if (clause.occur !== "must")
        queryError("query.unsupported-placement", clause.node.span, "this list takes only terms joined by AND", context)
      add(clause.node)
    }
  else if (typed) add(typed.root)
  for (const term of registry.defaults ?? []) {
    const root = parseLucene(term, { defaultField: "none", ...context }).root
    if (root.kind === "predicate" && !named.has(root.field)) terms.set(root.field, root.value)
  }
  return terms
}

/** An MCP list's `query` argument: the terms the CLI list takes after its arguments. */
export const queryArgument = (registry: QueryRegistry) => {
  const fields = askable(registry)
  return v.optional(
    v.pipe(
      v.string(),
      v.maxLength(QUERY_LIMITS.bytes),
      v.description(
        `field:value terms joined by AND that narrow the list; fields: ${fields.map(({ name }) => name).join(", ")}; e.g. ${
          fields[0]?.example ?? ""
        }`,
      ),
    ),
  )
}
