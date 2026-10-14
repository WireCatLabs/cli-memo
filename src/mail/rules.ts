import type { MailHeaders } from "./headers.js"

export interface MailRuleMatch {
  from?: string
  domain?: string
  listId?: string
}

export type MailAction = "skip" | "envelope" | "keep"

export interface MailRule {
  match: MailRuleMatch
  /** skip: never read or stored · envelope: stored without its text, so it can be counted and cleaned later. */
  action: MailAction
  reason?: string
  decidedAt: string
}

const domainOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1)

/** A domain also matches its subdomains: bulk mail often comes from `mail.` or `news.` of the same domain. */
export const matches = (match: MailRuleMatch, headers: MailHeaders): boolean => {
  const { from, domain, listId } = match
  if (from === undefined && domain === undefined && listId === undefined) return false
  const sender = headers.from
  const host = sender === undefined ? undefined : domainOf(sender)
  const wanted = domain?.toLowerCase()
  return (
    (from === undefined || sender === from.toLowerCase()) &&
    (wanted === undefined || (host !== undefined && (host === wanted || host.endsWith(`.${wanted}`)))) &&
    (listId === undefined || headers.listId === listId.toLowerCase())
  )
}

const RANK: Record<MailAction, number> = { keep: 0, envelope: 1, skip: 2 }

/**
 * The rule that decides an email: keep wins over envelope, envelope over skip, so a keep for one sender overrides
 * a skip of its domain, and mail both record and drop rules match is recorded, since a record can be cleaned later.
 */
export const decide = (rules: readonly MailRule[], headers: MailHeaders | undefined): MailRule | undefined => {
  if (headers === undefined) return undefined
  return rules.filter((rule) => matches(rule.match, headers)).sort((a, b) => RANK[a.action] - RANK[b.action])[0]
}

/** Where the store keeps the emails one envelope rule recorded: a mailbox of its own, per rule. */
export const envelopeBox = (match: MailRuleMatch) => {
  const [kind, value] =
    match.from !== undefined
      ? ["from", match.from]
      : match.domain !== undefined
        ? ["domain", match.domain]
        : ["list-id", match.listId ?? ""]
  return {
    externalId: `memo:envelope:${kind}:${value.toLowerCase()}`,
    name: `envelope: ${kind} ${value}`,
    kind: ENVELOPE,
  }
}

export const ENVELOPE = "envelope"

export const sameMatch = (a: MailRuleMatch, b: MailRuleMatch): boolean =>
  a.from?.toLowerCase() === b.from?.toLowerCase() &&
  a.domain?.toLowerCase() === b.domain?.toLowerCase() &&
  a.listId?.toLowerCase() === b.listId?.toLowerCase()

export const envelopeBoxOf = (externalId: string) => {
  const [, , kind, ...value] = externalId.split(":")
  return { externalId, name: `envelope: ${kind} ${value.join(":")}`, kind: ENVELOPE }
}
