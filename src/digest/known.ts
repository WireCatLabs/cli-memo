import type { MessageStore } from "@wirecat/cli-core/store"

/**
 * Which of a mailbox's emails come from a known sender: one whose person has other identities, or an address the
 * owner has written to before. A mail sync gives every sender a person of one identity, which says nothing.
 */
export const knownSenders = async (
  store: MessageStore,
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
  for (const address of await store.mail.writtenTo([...unlinked.keys()]))
    for (const id of unlinked.get(address) ?? []) known.add(id)
  return known
}
