import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import { type Author, type MessageStore, PROPOSAL_STATUSES, type ProposedAction } from "@wirecat/cli-core/store"
import { pageOf } from "../page.js"
import { type AccountScope, selectAccount } from "../store/scope.js"

export const ACTION_QUERY = {
  entity: "proposed_action",
  backend: "native",
  fields: [termField("status", "enum", "status:proposed", { values: PROPOSAL_STATUSES })],
} as const satisfies QueryRegistry

/** Proposed actions the store filters by the query's terms; CLI and MCP list through it. */
export const listActions = (store: MessageStore, query: readonly string[] | string | undefined, limit?: number) => {
  const status = queryTerms(query, ACTION_QUERY, "actions list").get("status") as ProposedAction["status"] | undefined
  return pageOf("actions list", limit, (most) =>
    store.proposedActions.list({ limit: most, ...(status === undefined ? {} : { status }) }),
  )
}

export interface NewProposal extends AccountScope {
  kind: string
  reason: string
  target?: string
  payload?: string
}

/** The account is the one that would act, and the task the proposal becomes on approval lands in its inbox. */
export const propose = async (store: MessageStore, proposal: NewProposal, by: Author): Promise<ProposedAction> => {
  let payload: unknown
  if (proposal.payload !== undefined) {
    try {
      payload = JSON.parse(proposal.payload)
    } catch {
      throw new CliError("validation_error", '--payload is JSON, such as {"text":"Friday works"}')
    }
  }
  return store.proposedActions.propose({
    kind: proposal.kind,
    by,
    account: await selectAccount(store, proposal),
    reason: proposal.reason,
    ...(proposal.target === undefined ? {} : { target: proposal.target }),
    ...(payload === undefined ? {} : { payload }),
  })
}
