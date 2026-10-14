import type { MailHeaders } from "./headers.js"

export interface MailRuleMatch {
  from?: string
  domain?: string
  listId?: string
}

export interface MailRule {
  match: MailRuleMatch
  action: "skip" | "keep"
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

/** Any matching keep wins over any matching skip, so a keep for one sender overrides a skip of its domain. */
export const decide = (rules: readonly MailRule[], headers: MailHeaders | undefined): "skip" | "keep" | undefined => {
  if (headers === undefined) return undefined
  const hits = rules.filter((rule) => matches(rule.match, headers))
  if (hits.some(({ action }) => action === "keep")) return "keep"
  return hits.length ? "skip" : undefined
}

export const sameMatch = (a: MailRuleMatch, b: MailRuleMatch): boolean =>
  a.from?.toLowerCase() === b.from?.toLowerCase() &&
  a.domain?.toLowerCase() === b.domain?.toLowerCase() &&
  a.listId?.toLowerCase() === b.listId?.toLowerCase()
