import type { QueryRegistry } from "@wirecat/cli-base/query"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import type { VocabularyOptions } from "@wirecat/cli-core/store"

export const VOCABULARY_QUERY = {
  entity: "vocabulary",
  backend: "native",
  fields: [
    termField("kind", "enum", "kind:tag", { values: ["project", "tag", "topic"] }),
    termField("scope", "enum", "scope:work", { values: ["personal", "work"] }),
  ],
} as const satisfies QueryRegistry

/** The catalog's kind and scope from a query; the store reads only those rows. */
export const vocabularyFilter = (
  query: readonly string[] | string | undefined,
  command: string,
): Pick<VocabularyOptions, "kind" | "scope"> => {
  const terms = queryTerms(query, VOCABULARY_QUERY, command)
  return {
    ...(terms.has("kind") ? { kind: terms.get("kind") as VocabularyOptions["kind"] } : {}),
    ...(terms.has("scope") ? { scope: terms.get("scope") as VocabularyOptions["scope"] } : {}),
  }
}
