import { type MessageStore, openCache, storePath } from "@wirecat/cli-core/store"

/**
 * Of these addresses, the ones the owner has written to (To or Cc of an outgoing email, any mailbox). One indexed
 * read of the store file: asking `emails({ participant })` per address scanned every email each time (~70 ms each on
 * a 260k mailbox), so a morning with 20 senders took a second longer. It belongs in cli-core as a store read.
 */
const writtenTo = async (env: NodeJS.ProcessEnv, addresses: string[]): Promise<Set<string>> => {
  if (addresses.length === 0) return new Set()
  const database = await openCache(storePath(env))
  try {
    const rows = database
      .prepare(
        `SELECT DISTINCT lower(r.address) AS address FROM emails e JOIN email_recipients r ON r.email_id = e.id
         WHERE e.outgoing = 1 AND e.deleted_at IS NULL AND r.role IN ('to', 'cc')
           AND lower(r.address) IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(addresses))
    return new Set(rows.map((row) => String(row.address)))
  } finally {
    database.close()
  }
}

/**
 * Which of a mailbox's emails come from a known sender: one whose person has other identities, or an address the
 * owner has written to before. A mail sync gives every sender a person of one identity, which says nothing.
 */
export const knownSenders = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  accountId: number,
  externalIds: readonly string[],
): Promise<Set<string>> => {
  if (externalIds.length === 0) return new Set()
  const [facts, marks] = await Promise.all([
    store.mail.emailFacts({ accountId, externalIds }),
    store.mail.emailMarks(accountId, externalIds),
  ])
  const known = new Set<string>()
  const unlinked = new Map<string, string[]>()
  for (const fact of facts) {
    const address = fact.fromAddress?.toLowerCase()
    if (!address) continue
    if ((marks.get(fact.externalId)?.senderIdentities ?? 0) > 1) known.add(fact.externalId)
    else unlinked.set(address, [...(unlinked.get(address) ?? []), fact.externalId])
  }
  for (const address of await writtenTo(env, [...unlinked.keys()]))
    for (const id of unlinked.get(address) ?? []) known.add(id)
  return known
}
