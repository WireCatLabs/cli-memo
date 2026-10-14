import type { QueryRegistry } from "@wirecat/cli-base/query"
import { FACT_STATUSES, FACT_TYPES, type Fact, type MessageStore } from "@wirecat/cli-core/store"
import { queryField, queryTerms } from "../list-query.js"
import { pageOf } from "../page.js"
import { canonicalProject } from "../vocabulary/project.js"

export const FACT_QUERY = {
  entity: "fact",
  backend: "native",
  fields: [
    queryField("kind", "enum", "kind:decision", FACT_TYPES),
    queryField("status", "enum", "status:proposed", FACT_STATUSES),
    queryField("project", "kw", "project:SYH"),
    queryField("subject", "ref", 'subject:"person:42"'),
  ],
} as const satisfies QueryRegistry

/** A fact under cli-core's `fact` entity names; `confirmed_by` is memo's own beyond it. */
export const factItem = ({ type, statement, source, confirmedBy, ...fact }: Fact) => ({
  ref: fact.ref,
  id: fact.id,
  kind: type,
  text: statement,
  status: fact.status,
  project: fact.project,
  subject: fact.subject,
  occurredAt: fact.occurredAt,
  supersedes: fact.supersedes,
  author: fact.author,
  model: fact.model,
  scope: fact.scope,
  origin: source,
  evidence: fact.evidence,
  createdAt: fact.createdAt,
  updatedAt: fact.updatedAt,
  confirmedBy,
})

/** Facts the store filters by the query's terms; CLI and MCP list through it. */
export const listFacts = async (store: MessageStore, query: readonly string[] | string | undefined, limit?: number) => {
  const terms = queryTerms(query, FACT_QUERY, "facts list")
  const project = terms.get("project")
  const filters = {
    ...(terms.has("kind") ? { type: terms.get("kind") as Fact["type"] } : {}),
    ...(terms.has("status") ? { status: terms.get("status") as Fact["status"] } : {}),
    ...(project === undefined ? {} : { project: await canonicalProject(store, project) }),
    ...(terms.has("subject") ? { subject: terms.get("subject") as string } : {}),
  }
  return pageOf("facts list", limit, async (most) =>
    (await store.facts.list({ ...filters, limit: most })).map(factItem),
  )
}
