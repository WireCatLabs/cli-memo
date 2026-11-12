import type { AccountKey, MessageStore, RecordKey } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { grantedLevel } from "../mcp/granted.js"

const MOST = 100

/** An entity as its `show` reads it: an import's row says `import:<provider>`, a CRM copy names its account. */
export interface Sourced {
  ref: string
  source?: string
  account?: AccountKey | null
}

/** Each kind an import makes, and the read that tells where one came from. */
const READS: Readonly<Record<string, (store: MessageStore, ref: string) => Promise<Sourced>>> = {
  product: (store, ref) => store.products.get(ref),
  contract: (store, ref) => store.contracts.get(ref),
  subscription: (store, ref) => store.subscriptions.get(ref),
  wallet: (store, ref) => store.wallets.get(ref),
  transaction: (store, ref) => store.transactions.get(ref),
  invoice: (store, ref) => store.finance.invoice(ref),
  payment: (store, ref) => store.finance.payment(ref),
  order: (store, ref) => store.orders.get(ref),
  deal: (store, ref) => store.deals.get(ref),
  lead: (store, ref) => store.deals.get(ref),
  pipeline: (store, ref) => store.deals.pipeline(ref),
}

export const SOURCED: ReadonlySet<string> = new Set(Object.keys(READS))

export const readSourced = (store: MessageStore, kind: string, ref: string) => READS[kind]?.(store, ref)

const IMPORT = "import:"

/** Whether an import or a CRM made it, so its title is the source's words, not the owner's. */
export const imported = ({ source, account }: Sourced) => (account ?? null) !== null || !!source?.startsWith(IMPORT)

/** The accounts whose records can be mapped to the entity: its CRM account, or every account of its import provider. */
export const sourceAccounts = async (store: MessageStore, { source, account }: Sourced): Promise<AccountKey[]> => {
  if (account) return [account]
  if (!source?.startsWith(IMPORT)) return []
  const provider = source.slice(IMPORT.length)
  return (await store.accounts.accounts()).filter((key) => key.provider === provider)
}

export interface SourceRecordRef {
  /** `type:external_id`, as `records show` takes it with `--account`. */
  record: string
  account: string
  flagged?: true
  deleted?: true
}

export interface NamingRecord {
  record: string
  account: string
  role: string
  as: string | null
}

export interface SourcesOf {
  records: { items: SourceRecordRef[]; hasMore: boolean }
  incoming: { items: NamingRecord[]; hasMore: boolean }
}

const named = (key: RecordKey) => ({
  record: `${key.type}:${key.externalId}`,
  account: `${key.provider}:${key.account}`,
})

/**
 * Where an entity came from: the records of its source's accounts mapped to it, and the live records of any account
 * whose relations name it, such as a quote `quoted-for` a deal.
 */
export const sourcesOf = async (store: MessageStore, entity: Sourced): Promise<SourcesOf> => {
  const { ref } = entity
  const records: SourceRecordRef[] = []
  for (const { provider, account } of await sourceAccounts(store, entity)) {
    if (records.length > MOST) break
    for (const one of (await store.records.list({ provider, account, entity: ref, limit: MOST + 1 })).items)
      records.push({
        ...named(one),
        ...(one.flagged ? { flagged: true as const } : {}),
        ...(one.deletedAt === null ? {} : { deleted: true as const }),
      })
  }
  const incoming = await store.records.incoming({ entity: ref }, { limit: MOST + 1 })
  return {
    records: { items: records.slice(0, MOST), hasMore: records.length > MOST },
    incoming: {
      items: incoming.slice(0, MOST).map(({ record, role, as }) => ({ ...named(record), role, as })),
      hasMore: incoming.length > MOST,
    },
  }
}

export const sourcesText = (ref: string, { records, incoming }: SourcesOf, indent = "  "): string[] => [
  ...records.items.map(
    (one) =>
      `${indent}from ${one.account} ${one.record}${one.flagged ? " (flagged)" : ""}${one.deleted ? " (deleted)" : ""}`,
  ),
  ...incoming.items.map(
    (one) => `${indent}named by ${one.account} ${one.record} as ${one.role}${one.as === null ? "" : ` (${one.as})`}`,
  ),
  ...(records.hasMore || incoming.hasMore
    ? [`${indent}more: memo records list entity:${ref} --account <account>`]
    : []),
]

/** `sources` names source records, which `records show` reads: an MCP client denied that gets none. */
export const recordsHidden = (command: Command) => grantedLevel(command, "records.show") === "deny"

/** An entity's `show` answer with where it came from beside it. */
export const withSources = async <T extends Sourced>(command: Command, store: MessageStore, item: T) =>
  recordsHidden(command) ? item : { ...item, sources: await sourcesOf(store, item) }
