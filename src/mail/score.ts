import { isDisposableEmailDomain } from "disposable-email-domains-js"
import { getDomain } from "tldts"
import type { Listed } from "./source.js"

/**
 * How much each sign of spam, a scam or a robot adds to a sender's score. Gmail filters spam before it reaches
 * All Mail, so these mostly find what got through: spoofed senders, scams and robots no rule covers yet.
 */
export const WEIGHTS = {
  spam_folder: 4,
  dmarc_fail: 3,
  brand_spoof: 3,
  young_domain: 3,
  reply_to_elsewhere: 2,
  disposable_domain: 2,
  bulk_never_replied: 1,
  replied: -5,
} as const

export type Signal = keyof typeof WEIGHTS

export const SCORE_RULE =
  "score adds: in Gmail's Spam +4, Gmail's DMARC check failed +3, a brand in the display name sent from another " +
  "domain +3, the domain under 180 days old when the mail came +3 (only with looked-up ages), Reply-To on another " +
  "domain +2, a throwaway-mail domain +2, bulk mail never replied to +1, replied to by the owner -5"

/** A domain registered too recently to trust: under this many days old when the mail arrived. */
export const YOUNG_DAYS = 180

/** What the registry said about a domain; `created` is ISO 8601, `unsupported` when its registry has no RDAP. */
export interface DomainAge {
  created?: string
  unsupported?: boolean
  checkedAt: string
}

/** The part of a host a person registers: `mail.news.example.co.uk` is `example.co.uk`. */
export const registrableOf = (address: string): string => {
  const host = address.slice(address.lastIndexOf("@") + 1).toLowerCase()
  return getDomain(host) ?? host
}

/**
 * The big mailbox providers. Their domains are years old and say nothing about the sender, so they are never
 * looked up; a brand display name sent from one of them is the classic scam.
 */
export const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "yandex.ru",
  "ya.ru",
  "mail.ru",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "rambler.ru",
  "zoho.com",
])

/** A brand and the first labels of the domains it really sends from. */
const BRANDS: Record<string, string[]> = {
  paypal: ["paypal"],
  apple: ["apple", "icloud"],
  microsoft: ["microsoft", "outlook", "office", "office365", "live", "hotmail", "azure"],
  google: ["google", "gmail", "youtube", "googlemail"],
  amazon: ["amazon", "amazonaws", "aws"],
  netflix: ["netflix"],
  facebook: ["facebook", "facebookmail", "meta", "fb"],
  instagram: ["instagram", "facebookmail"],
  whatsapp: ["whatsapp"],
  linkedin: ["linkedin"],
  dhl: ["dhl"],
  fedex: ["fedex"],
  docusign: ["docusign"],
  dropbox: ["dropbox"],
  binance: ["binance"],
  coinbase: ["coinbase"],
  revolut: ["revolut"],
}

/** The brand a display name claims while the address belongs to someone else, if any. */
export const spoofedBrand = (name: string | undefined, address: string | undefined): string | undefined => {
  if (name === undefined || address === undefined) return undefined
  const label = registrableOf(address).split(".")[0] ?? ""
  return Object.entries(BRANDS).find(
    ([brand, owned]) => new RegExp(`\\b${brand}\\b`, "i").test(name) && !owned.includes(label),
  )?.[0]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Under YOUNG_DAYS old at `at`; false when the age is not known. */
export const youngAt = (age: DomainAge | undefined, at: string): boolean =>
  age?.created !== undefined && Date.parse(at) - Date.parse(age.created) < YOUNG_DAYS * DAY_MS

export interface Scored {
  score: number
  signals: Signal[]
}

const most = (items: Listed[], test: (item: Listed) => boolean | undefined) =>
  items.filter((item) => test(item)).length * 2 >= items.length

/**
 * A sender group's score from the facts its emails carry. A sign counts when it holds for at least half the group's
 * emails, so one odd email does not mark a sender; a spoofed brand counts on any one.
 */
export const scoreGroup = (
  items: Listed[],
  context: { replied: boolean; bulk: number; ages: ReadonlyMap<string, DomainAge> },
): Scored => {
  const signals: Signal[] = []
  const judged = items.filter((item) => item.headers?.auth?.dmarc !== undefined)
  if (most(items, (item) => item.labels?.includes("Spam"))) signals.push("spam_folder")
  if (judged.length && most(judged, (item) => item.headers?.auth?.dmarc === "fail")) signals.push("dmarc_fail")
  if (items.some((item) => spoofedBrand(item.headers?.fromName, item.headers?.from) !== undefined))
    signals.push("brand_spoof")
  const sender = items.find((item) => item.headers?.from !== undefined)?.headers?.from
  const domain = sender === undefined ? undefined : registrableOf(sender)
  const first = items.reduce((a, b) => (a.receivedAt < b.receivedAt ? a : b))
  if (domain !== undefined && youngAt(context.ages.get(domain), first.receivedAt)) signals.push("young_domain")
  if (
    most(items, (item) => {
      const { from, replyTo } = item.headers ?? {}
      return from !== undefined && replyTo !== undefined && registrableOf(replyTo) !== registrableOf(from)
    })
  )
    signals.push("reply_to_elsewhere")
  if (domain !== undefined && isDisposableEmailDomain(domain)) signals.push("disposable_domain")
  if (context.bulk >= 0.8 && !context.replied) signals.push("bulk_never_replied")
  if (context.replied) signals.push("replied")
  return { score: signals.reduce((sum, signal) => sum + WEIGHTS[signal], 0), signals }
}
