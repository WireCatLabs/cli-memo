import { MEETING_FINDINGS_KIND } from "@wirecat/cli-core/meetings"
import { type ProposalRegistry, type ProposalRow, proposalRegistry } from "@wirecat/cli-core/services"
import { MAIL_FINDINGS_KIND, type MessageStore, SOURCE_REVIEW_KIND } from "@wirecat/cli-core/store"

/** What a row adds beyond cli-core's `ProposalRow`: where it came from, for grouping. */
export type ReviewRow = ProposalRow & { source?: string | null }

/** Every kind `memo review` shows, as `kind:` takes them. */
export const REVIEW_KINDS = [
  "relationship",
  "relationship_update",
  "key_document",
  "fact",
  "memory",
  SOURCE_REVIEW_KIND,
  "findings",
  "meeting_findings",
  MAIL_FINDINGS_KIND,
  "task_close",
  "action",
  "invoice",
  "payment",
  "order",
  "contract",
  "subscription",
  "subscription_price",
  "transaction",
  "identity_link",
] as const

const BY_ACCOUNT: readonly string[] = [MEETING_FINDINGS_KIND, MAIL_FINDINGS_KIND]

/** cli-core's registry, with each mail and meeting batch grouped under the account it came from. */
export const reviewRegistry = (store: MessageStore): ProposalRegistry => {
  const registry = proposalRegistry(store)
  const sourced = async (row: ProposalRow): Promise<ReviewRow> => {
    if (!BY_ACCOUNT.includes(row.kind)) return row
    const { account } = await store.proposedActions.get(row.id)
    return { ...row, source: account === null ? null : `${account.provider}:${account.account}` }
  }
  return {
    ...registry,
    list: async (filter) => {
      const found = await registry.list(filter)
      return { ...found, items: await Promise.all(found.items.map(sourced)) }
    },
    get: async (id) => sourced(await registry.get(id)),
  }
}
