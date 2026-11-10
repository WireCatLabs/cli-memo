import type { QueryRegistry } from "@wirecat/cli-base/query"
import { queryTerms, termField, typedQuery } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import { pageOf } from "../page.js"

export const AGENT_LOG_QUERY = {
  entity: "agent_action",
  backend: "native",
  fields: [
    termField("tool", "kw", "tool:search_all"),
    termField("agent", "kw", "agent:tg-mcp", { relation: "the calls of this agent, as actor.name names it" }),
  ],
} as const satisfies QueryRegistry

/** Tool calls the store filters by the query's terms; CLI and MCP read through it. */
export const listAgentActions = (
  store: MessageStore,
  query: readonly string[] | string | undefined,
  limit?: number,
  page?: number,
) => {
  const terms = queryTerms(query, AGENT_LOG_QUERY, "agents list")
  const tool = terms.get("tool")
  const agent = terms.get("agent")
  return pageOf(
    "agents list",
    limit,
    (most, offset) =>
      store.agentActions.list({
        ...(tool === undefined ? {} : { tool }),
        ...(agent === undefined ? {} : { agent }),
        limit: most,
        offset,
      }),
    { page, args: { query: typedQuery(query) } },
  )
}
