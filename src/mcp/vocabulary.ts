import { CliError } from "@wirecat/cli-base"
import { queryArgument } from "@wirecat/cli-core/cli"
import * as v from "valibot"
import { itemAnswer } from "../answer.js"
import { VOCABULARY_QUERY, vocabularyFilter } from "../vocabulary/list.js"
import { define } from "./tool.js"

const bounded = (maximum: number) => v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(maximum)))
const budget = { maxEntries: bounded(20000), maxReadBytes: bounded(16777216) }
const options = {
  kind: v.optional(v.picklist(["project", "tag", "topic"])),
  scope: v.optional(v.picklist(["personal", "work"])),
  ...budget,
}
export const vocabularyTools = {
  vocabulary_list: define({
    title: "List canonical vocabulary",
    description:
      "Canonical projects, tags and topics with IDs, aliases and usage counts, narrowed by a query such as kind:tag or scope:work. This loads no model.",
    writes: false,
    input: v.object({ query: queryArgument(VOCABULARY_QUERY), ...budget }),
    run: async (store, { query, ...args }) =>
      itemAnswer(await store.knowledge.vocabulary({ ...args, ...vocabularyFilter(query, "vocabulary list") })),
  }),
  vocabulary_check: define({
    title: "Check vocabulary names",
    description:
      "With a name: the existing canonical tag or topic, or lexical candidates to review, before creating a label. Without one: a bounded lexical comparison of canonical names and aliases; an incomplete scan does not prove uniqueness. Similarity never merges records, and this tool accepts, merges and creates nothing.",
    writes: false,
    input: v.object({
      ...options,
      name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
      minSimilarity: v.optional(v.pipe(v.number(), v.minValue(0.65), v.maxValue(1))),
      maxComparisons: bounded(100000),
      limit: bounded(200),
    }),
    run: async (store, { name, kind, scope, minSimilarity, maxComparisons, limit, ...budget }) => {
      if (name === undefined)
        return itemAnswer(
          await store.knowledge.auditVocabulary({
            ...budget,
            ...(kind === undefined ? {} : { kind }),
            ...(scope === undefined ? {} : { scope }),
            ...(minSimilarity === undefined ? {} : { minSimilarity }),
            ...(maxComparisons === undefined ? {} : { maxComparisons }),
            ...(limit === undefined ? {} : { limit }),
          }),
        )
      if (kind === "project" || scope !== undefined)
        throw new CliError("validation_error", "a new name is a tag or topic: kind tag or topic, no scope")
      if (minSimilarity !== undefined || maxComparisons !== undefined || limit !== undefined)
        throw new CliError(
          "validation_error",
          "minSimilarity, maxComparisons and limit check the whole vocabulary: no name",
        )
      return itemAnswer(
        await store.knowledge.tagPreflight(name, { ...budget, ...(kind === undefined ? {} : { kind }) }),
      )
    },
  }),
  vocabulary_show: define({
    title: "Show a canonical name",
    description:
      "Resolve only exact names and explicit aliases. Ambiguous matches remain candidates; never infer identity from similarity.",
    writes: false,
    input: v.object({ name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)), ...options }),
    run: async (store, { name, ...args }) => itemAnswer(await store.knowledge.resolveVocabulary(name, args)),
  }),
}
