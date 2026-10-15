import { CliError } from "@wirecat/cli-base"
import type { MailRule, MailRuleMatch } from "./rules.js"

export interface FiltersProposal {
  rules: MailRule[]
  skipped: { filter: string; why: string }[]
}

type Raw = Record<string, unknown>

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : []

const yes = (value: unknown) => value === true || value === "true"

const SYSTEM = new Set(["INBOX", "UNREAD", "SPAM", "TRASH", "IMPORTANT", "STARRED", "CATEGORY_PROMOTIONS"])

/** `a@b.example` is one sender; `b.example` or `@b.example` a whole domain; anything else memo cannot match. */
const senderOf = (from: string): MailRuleMatch | undefined => {
  const value = from.replace(/^\(|\)$/g, "").trim()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { from: value }
  const domain = value.replace(/^@/, "")
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain) ? { domain } : undefined
}

/**
 * One filter, in either shape Google writes them: the Gmail API's `{criteria, action}` (developers.google.com,
 * users.settings.filters) or the settings export's flat properties (`from`, `hasTheWord`, `shouldArchive`, `label`).
 */
const ruleOf = (raw: Raw, decidedAt: string): MailRule | string => {
  const criteria = (raw.criteria as Raw | undefined) ?? raw
  const action = (raw.action as Raw | undefined) ?? raw
  if (
    text(criteria.query) ??
    text(criteria.hasTheWord) ??
    text(criteria.negatedQuery) ??
    text(criteria.doesNotHaveTheWord)
  )
    return "it searches words, which memo cannot match"
  if (criteria.size !== undefined || text(criteria.to) !== undefined)
    return "it matches size or recipients, which this import does not map"
  const from = text(criteria.from)
  const sender = from === undefined ? undefined : senderOf(from)
  if (from !== undefined && sender === undefined) return "its sender is not one address or domain"
  const subject = text(criteria.subject)
  const match: MailRuleMatch = {
    ...sender,
    ...(subject === undefined ? {} : { subject }),
    ...(yes(criteria.hasAttachment) ? { has_attachments: true } : {}),
  }
  if (Object.keys(match).length === 0) return "it has no sender or subject"
  const removed = list(action.removeLabelIds)
  const added = list(action.addLabelIds)
  const hides =
    removed.includes("INBOX") ||
    removed.includes("UNREAD") ||
    added.includes("TRASH") ||
    yes(action.shouldArchive) ||
    yes(action.shouldMarkAsRead) ||
    yes(action.shouldTrash)
  const tags = [
    ...added.filter((id) => !SYSTEM.has(id)),
    ...(text(action.label) === undefined ? [] : [text(action.label) as string]),
  ]
  if (!hides && tags.length === 0) return "it does nothing memo can mirror"
  return {
    match,
    action: hides ? "envelope" : "keep",
    ...(tags.length ? { tags } : {}),
    source: "gmail-filter",
    reason: "from a Gmail filter",
    decided_at: decidedAt,
  }
}

const nameOf = (raw: Raw, index: number) => {
  const criteria = (raw.criteria as Raw | undefined) ?? raw
  return text(criteria.from) ?? text(criteria.subject) ?? text(raw.id) ?? `filter ${index + 1}`
}

/** The rules a Takeout Filters.json suggests; nothing is saved here. */
export const importFilters = (json: string, path: string, now = new Date()): FiltersProposal => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new CliError("validation_error", `${path}: not JSON`, { reason: "mail.filters-file-invalid" })
  }
  const filters = Array.isArray(parsed) ? parsed : ((parsed as Raw | null)?.filters ?? (parsed as Raw | null)?.filter)
  if (!Array.isArray(filters))
    throw new CliError("validation_error", `${path}: no list of filters`, { reason: "mail.filters-file-invalid" })
  const proposal: FiltersProposal = { rules: [], skipped: [] }
  for (const [index, raw] of filters.entries()) {
    if (raw === null || typeof raw !== "object") continue
    const outcome = ruleOf(raw as Raw, now.toISOString())
    if (typeof outcome === "string") proposal.skipped.push({ filter: nameOf(raw as Raw, index), why: outcome })
    else proposal.rules.push(outcome)
  }
  return proposal
}
