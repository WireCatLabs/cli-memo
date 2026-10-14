import { decodeWords } from "postal-mime"

/**
 * The header fields memo reads at list time: enough to group mail by sender, apply the owner's rules and keep
 * an envelope of the mail a rule records without its text.
 */
export const HEADER_FIELDS = "FROM TO CC SUBJECT LIST-ID LIST-UNSUBSCRIBE PRECEDENCE"

export interface MailHeaders {
  /** The sender's address, lower case; absent when From holds none. */
  from?: string
  /** The sender's display name, decoded. */
  fromName?: string
  subject?: string
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

const nameOf = (value: string): string | undefined => {
  const before = /^\s*(.*?)\s*<[^<>]+>\s*$/.exec(value)?.[1]
  const name = before?.replace(/^"(.*)"$/, "$1").trim()
  return name ? decodeWords(name) : undefined
}

const listIdOf = (raw: string | undefined): string | undefined =>
  raw === undefined ? undefined : (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim().toLowerCase() || undefined

/** The header fields of one email, from its header text. */
export const headersOf = (text: string): MailHeaders => {
  const unfolded = unfold(text)
  const sender = field(unfolded, "From")
  const [from] = addressesOf(sender)
  const fromName = sender === undefined ? undefined : nameOf(sender)
  const subject = field(unfolded, "Subject")
  const listId = listIdOf(field(unfolded, "List-Id"))
  const bulk =
    Boolean(listId) ||
    field(unfolded, "List-Unsubscribe") !== undefined ||
    /^(bulk|list|junk)\b/i.test(field(unfolded, "Precedence") ?? "")
  return {
    ...(from === undefined ? {} : { from }),
    ...(fromName ? { fromName } : {}),
    ...(subject === undefined ? {} : { subject: decodeWords(subject).trim() }),
    to: [...addressesOf(field(unfolded, "To")), ...addressesOf(field(unfolded, "Cc"))],
    ...(listId ? { listId } : {}),
    bulk,
  }
}

/**
 * List-Id and the bulk-mail fields of a whole email, kept on mail stored in full so a rule can be matched from
 * the store later. Names are the header names, lower case.
 */
export const mailHeadersOf = (raw: Uint8Array): Record<string, string | boolean> => {
  const bytes = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  const end = [bytes.indexOf("\r\n\r\n"), bytes.indexOf("\n\n")].filter((at) => at !== -1)
  const head = bytes.subarray(0, end.length ? Math.min(...end) : Math.min(bytes.length, 256 * 1024))
  const unfolded = unfold(head.toString("utf8"))
  const listId = listIdOf(field(unfolded, "List-Id"))
  const precedence = field(unfolded, "Precedence")?.trim().toLowerCase()
  return {
    ...(listId ? { "list-id": listId } : {}),
    ...(field(unfolded, "List-Unsubscribe") === undefined ? {} : { "list-unsubscribe": true }),
    ...(precedence ? { precedence } : {}),
  }
}
