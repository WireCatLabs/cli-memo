import type { QueryRegistry } from "@wirecat/cli-base/query"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
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
