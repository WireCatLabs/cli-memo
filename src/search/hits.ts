import { formatLocator, parseLocator } from "@wirecat/cli-core"
import type { SearchAllFound, SearchFound } from "@wirecat/cli-core/services"

// cli-core shapes its hits in search-answers.ts but does not export the mappers; these copy them field for field.

const defined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, one]) => one !== undefined))

const EXCERPT = 240

const excerptOf = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > EXCERPT ? `${line.slice(0, EXCERPT - 1)}…` : line
}

/** A found message or email as the `message.hit` view. */
export const messageHit = (hit: SearchFound["items"][number]): Record<string, unknown> => {
  const at = parseLocator(hit.locator)
  const around = hit.thread?.items ?? hit.context
  return defined({
    ref: hit.locator,
    chat_title: hit.chatTitle ?? undefined,
    timestamp: hit.timestamp,
    sender_name: hit.senderName,
    excerpt: hit.excerpt ?? excerptOf(hit.text),
    matched_in: hit.matchedIn,
    score: hit.score ?? undefined,
    found_in: hit.source,
    discovery: hit.discovery
      ? defined({
          coverage: hit.discovery.coverage,
          matched_terms: hit.discovery.matchedTerms,
          missing_terms: hit.discovery.missingTerms,
          parent: hit.discovery.parent,
        })
      : undefined,
    email: hit.email
      ? {
          subject: hit.email.subject,
          from: hit.email.from,
          to: hit.email.to,
          cc: hit.email.cc,
          bcc: hit.email.bcc,
          reply_addresses: hit.email.replyTo,
          labels: hit.email.labels,
          thread: hit.email.thread,
          read: hit.email.read,
          flagged: hit.email.flagged,
        }
      : undefined,
    context: around?.map((one) => ({
      ref: formatLocator({ ...at, message: one.id }),
      timestamp: one.timestamp,
      sender_name: one.senderName,
      text: one.text,
    })),
  })
}

const BRIEF = ["ref", "chat_title", "timestamp", "sender_name", "excerpt", "score"]

/** `--brief`: the reference, when, who and the excerpt. */
export const briefHit = (hit: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(BRIEF.flatMap((key) => (hit[key] === undefined || hit[key] === null ? [] : [[key, hit[key]]])))

/** One `search all` result as the `hit` entity. */
export const allHit = (item: SearchAllFound["items"][number]): Record<string, unknown> =>
  defined({
    kind: item.kind,
    ref: item.ref,
    provider: item.provider,
    account: item.account,
    title: item.title,
    timestamp: item.timestamp,
    excerpt: item.text,
    sender_name: item.from?.name,
    sender_ref: item.from?.ref,
    found_by: item.foundBy,
  })
