import { type Predicate, parseLucene, type QueryRegistry, queryError } from "@wirecat/cli-base/query"
import { LIST_QUERY_GUIDE, queryTerms, termField, typedQuery } from "@wirecat/cli-core/cli"
import { MEMORY_KINDS, MEMORY_SCOPES, MEMORY_STATUSES, type Memory, type MessageStore } from "@wirecat/cli-core/store"
import { pageOf } from "../page.js"

export const MEMORY_QUERY = {
  entity: "memory",
  backend: "native",
  fields: [
    termField("kind", "enum", "kind:preference", { values: MEMORY_KINDS }),
    termField("status", "enum", "status:proposed", { values: MEMORY_STATUSES }),
    termField("scope", "enum", "scope:work", { values: MEMORY_SCOPES }),
    termField("subject", "ref", 'subject:"person:42"'),
  ],
} as const satisfies QueryRegistry

/** A memory under cli-core's `memory` entity names. */
export const memoryItem = ({ body, ...memory }: Memory) => ({
  ref: memory.ref,
  id: memory.id,
  kind: memory.kind,
  text: body,
  subject: memory.subject,
  author: memory.author,
  model: memory.model,
  confidence: memory.confidence,
  status: memory.status,
  scope: memory.scope,
  supersedes: memory.supersedes,
  evidence: memory.evidence,
  lastVerifiedAt: memory.lastVerifiedAt,
  createdAt: memory.createdAt,
  updatedAt: memory.updatedAt,
})

/** Memories the store filters by the query's terms; CLI and MCP list through it. */
export const listMemories = (store: MessageStore, query: readonly string[] | string | undefined, limit?: number) => {
  const terms = queryTerms(query, MEMORY_QUERY, "memories list")
  const filters = {
    ...(terms.has("kind") ? { kind: terms.get("kind") as Memory["kind"] } : {}),
    ...(terms.has("status") ? { status: terms.get("status") as Memory["status"] } : {}),
    ...(terms.has("scope") ? { scope: terms.get("scope") as Memory["scope"] } : {}),
    ...(terms.has("subject") ? { subject: terms.get("subject") as string } : {}),
  }
  return pageOf("memories list", limit, async (most) =>
    (await store.memories.list({ ...filters, limit: most })).map(memoryItem),
  )
}

const SEARCH = { command: "search memories", guide: LIST_QUERY_GUIDE }

/**
 * The store matches every word and narrows by scope in SQL, so the query is words and at most one `scope:`, all
 * joined by AND; anything the store cannot ask is refused rather than filtered afterwards.
 */
export const searchMemories = (store: MessageStore, query: readonly string[] | string, limit?: number) => {
  const { root } = parseLucene(typedQuery(query), { ...SEARCH, defaultField: "text" })
  const clauses: Predicate[] = []
  if (root.kind === "predicate") clauses.push(root)
  else
    for (const { occur, node } of root.clauses) {
      if (occur !== "must" || node.kind !== "predicate")
        queryError("query.unsupported-operator", node.span, "join words and scope: with AND only", SEARCH)
      clauses.push(node)
    }
  const words: string[] = []
  let scope: Memory["scope"] | undefined
  for (const term of clauses) {
    if (term.field === "text" && (term.operator === "term" || term.operator === "phrase")) words.push(term.value)
    else if (term.field === "scope" && term.operator === "term" && scope === undefined) {
      const value = term.value.toLowerCase()
      if (!(MEMORY_SCOPES as readonly string[]).includes(value))
        queryError("query.invalid-value", term.span, `scope is ${MEMORY_SCOPES.join(" or ")}`, SEARCH)
      scope = value as Memory["scope"]
    } else queryError("query.unsupported-field", term.span, "words, and scope:personal or scope:work once", SEARCH)
  }
  return pageOf(
    "search memories",
    limit,
    async (most) =>
      (await store.memories.search(words.join(" "), { limit: most, ...(scope === undefined ? {} : { scope }) })).map(
        memoryItem,
      ),
    { fallback: 20, cap: 200 },
  )
}
