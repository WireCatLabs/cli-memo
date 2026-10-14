/** The header fields memo reads at list time: enough to group mail by sender and apply the owner's rules. */
export const HEADER_FIELDS = "FROM TO CC LIST-ID LIST-UNSUBSCRIBE PRECEDENCE"

export interface MailHeaders {
  /** The sender's address, lower case; absent when From holds none. */
  from?: string
  /** To and Cc addresses, lower case. */
  to: string[]
  listId?: string
  /** List-Id, List-Unsubscribe or `Precedence: bulk|list|junk`: mail sent to many, not written to one. */
  bulk: boolean
}

export const unfold = (text: string): string => text.replace(/\r?\n[ \t]+/g, " ")

export const field = (unfolded: string, name: string): string | undefined =>
  new RegExp(`^${name}:[ \\t]*(.*?)\\r?$`, "im").exec(unfolded)?.[1]

export const addressesOf = (value: string | undefined): string[] => {
  if (value === undefined) return []
  const bracketed = [...value.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)].map(([, address]) => address as string)
  const found = bracketed.length ? bracketed : (value.match(/[^\s<>,;:"()]+@[^\s<>,;:"()]+/g) ?? [])
  return found.map((address) => address.toLowerCase())
}

/** The header fields of one email, from its header text. */
export const headersOf = (text: string): MailHeaders => {
  const unfolded = unfold(text)
  const [from] = addressesOf(field(unfolded, "From"))
  const rawList = field(unfolded, "List-Id")
  const listId = rawList === undefined ? undefined : (/<([^>]+)>/.exec(rawList)?.[1] ?? rawList).trim().toLowerCase()
  const bulk =
    Boolean(listId) ||
    field(unfolded, "List-Unsubscribe") !== undefined ||
    /^(bulk|list|junk)\b/i.test(field(unfolded, "Precedence") ?? "")
  return {
    ...(from === undefined ? {} : { from }),
    to: [...addressesOf(field(unfolded, "To")), ...addressesOf(field(unfolded, "Cc"))],
    ...(listId ? { listId } : {}),
    bulk,
  }
}
