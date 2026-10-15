import { describe, expect, it } from "vitest"
import { importFilters } from "./filters.js"
import { actionsOf, filterMatch } from "./rule-query.js"
import { decide, envelopeBox, type MailFacts, type MailRule, matches, tagsOf } from "./rules.js"

const NOW = Date.parse("2026-10-15T00:00:00Z")

const facts = (more: Partial<MailFacts> & { from?: string; subject?: string } = {}): MailFacts => {
  const { from = "alerts@shop.example", subject = "Your weekly deals", ...rest } = more
  return {
    headers: { from, subject, to: [], bulk: false },
    receivedAt: "2026-10-01T00:00:00Z",
    size: 2_000_000,
    labels: ["Inbox"],
    seen: false,
    ...rest,
  }
}

const rule = (match: MailRule["match"], action: MailRule["action"], more: Partial<MailRule> = {}): MailRule => ({
  match,
  action,
  decided_at: "2026-10-15T00:00:00.000Z",
  ...more,
})

describe("rule conditions", () => {
  it("needs every condition it names to hold", () => {
    expect(matches({ domain: "shop.example", subject: "DEALS weekly" }, facts(), NOW)).toBe(true)
    expect(matches({ domain: "shop.example", subject: "invoice" }, facts(), NOW)).toBe(false)
    expect(matches({}, facts(), NOW)).toBe(false)
  })

  it("matches age, size, labels, read state and bulk from what the listing says", () => {
    expect(matches({ older_than_days: 10 }, facts(), NOW)).toBe(true)
    expect(matches({ older_than_days: 30 }, facts(), NOW)).toBe(false)
    expect(matches({ larger_than_bytes: 1_000_000 }, facts(), NOW)).toBe(true)
    expect(matches({ label: "inbox" }, facts(), NOW)).toBe(true)
    expect(matches({ unread: true }, facts({ seen: true }), NOW)).toBe(false)
    expect(matches({ bulk: true }, facts(), NOW)).toBe(false)
  })

  it("never matches a fact the listing did not give", () => {
    const bare: MailFacts = { headers: { from: "alerts@shop.example", to: [], bulk: false } }
    expect(matches({ larger_than_bytes: 1 }, bare, NOW)).toBe(false)
    expect(matches({ unread: true }, bare, NOW)).toBe(false)
    expect(matches({ score_at_least: 0 }, bare, NOW)).toBe(false)
  })

  it("reads attachments from Content-Type and a score from the sender's group", () => {
    expect(matches({ has_attachments: true }, facts({ headers: { to: [], bulk: false, attachments: true } }))).toBe(
      true,
    )
    expect(matches({ score_at_least: 3 }, facts({ score: 4 }), NOW)).toBe(true)
    expect(matches({ score_at_least: 3 }, facts({ score: 2 }), NOW)).toBe(false)
  })

  it("matches a preset by sender and kind, never mail from someone the owner wrote to", () => {
    expect(matches({ preset: "social" }, facts({ from: "notify@linkedin.com" }), NOW)).toBe(true)
    expect(matches({ preset: "social" }, facts({ from: "notify@linkedin.com", replied: true }), NOW)).toBe(false)
    const list = facts({ headers: { from: "editor@letters.example", to: [], bulk: true, listId: "weekly.example" } })
    expect(matches({ preset: "newsletters" }, list, NOW)).toBe(true)
    expect(matches({ preset: "shopping" }, facts({ labels: ["Promotions"] }), NOW)).toBe(true)
  })
})

describe("decide", () => {
  it("lets a protected rule win over every other rule and keeps its mail whole", () => {
    const rules = [
      rule({ domain: "gov.example" }, "keep", { protected: true }),
      rule({ older_than_days: 1 }, "skip"),
      rule({ subject: "notice" }, "envelope"),
    ]
    const notice = facts({ from: "notice@tax.gov.example", subject: "Tax notice" })
    expect(decide(rules, notice)).toMatchObject({ protected: true, action: "keep" })
    expect(decide(rules, facts())).toMatchObject({ action: "skip" })
  })

  it("lets an explicit rule win over a preset", () => {
    const rules = [
      rule({ preset: "social" }, "envelope", { source: "preset:social" }),
      rule({ from: "jobs@linkedin.com" }, "skip"),
    ]
    expect(decide(rules, facts({ from: "jobs@linkedin.com" }))?.action).toBe("skip")
    expect(decide(rules, facts({ from: "notify@linkedin.com" }))?.action).toBe("envelope")
  })

  it("collects the tags of every matching rule, whatever decides", () => {
    const rules = [
      rule({ domain: "shop.example" }, "envelope", { tags: ["shopping"] }),
      rule({ larger_than_bytes: 1_000_000 }, "keep", { tags: ["large", "shopping"] }),
    ]
    expect(tagsOf(rules, facts())).toEqual(["shopping", "large"])
  })

  it("names the mailbox of a rule with several conditions by all of them", () => {
    expect(envelopeBox({ domain: "Shop.example" }).externalId).toBe("memo:envelope:domain:shop.example")
    expect(envelopeBox({ subject: "deals", unread: true }).externalId).toBe(
      "memo:envelope:rule:subject deals, unread true",
    )
  })
})

describe("import-filters", () => {
  it("turns hiding filters into envelope rules and labels into tags, in both shapes Google writes", () => {
    const file = JSON.stringify([
      { criteria: { from: "news@shop.example" }, action: { removeLabelIds: ["INBOX"], addLabelIds: ["Label_7"] } },
      { from: "@club.example", label: "Club", shouldMarkAsRead: "true" },
      { criteria: { subject: "Invoice" }, action: { addLabelIds: ["Label_9"] } },
      { criteria: { query: "unsubscribe" }, action: { removeLabelIds: ["INBOX"] } },
      { criteria: { from: "a@x.example OR b@y.example" }, action: { removeLabelIds: ["INBOX"] } },
    ])
    const { rules, skipped } = importFilters(file, "Filters.json", new Date(NOW))
    expect(rules).toMatchObject([
      { match: { from: "news@shop.example" }, action: "envelope", tags: ["Label_7"], source: "gmail-filter" },
      { match: { domain: "club.example" }, action: "envelope", tags: ["Club"] },
      { match: { subject: "Invoice" }, action: "keep", tags: ["Label_9"] },
    ])
    expect(skipped.map(({ why }) => why)).toEqual([
      "it searches words, which memo cannot match",
      "its sender is not one address or domain",
    ])
  })

  it("refuses a file that is not a list of filters", () => {
    expect(() => importFilters("{}", "Filters.json")).toThrow(/no list of filters/)
  })
})

describe("--filter and --do", () => {
  it("reads every field of a filter query, bare words as subject words", () => {
    expect(
      filterMatch('invoice subject:paid older:365d larger:5MB has:attachment label:"Old receipts" is:unread score:3'),
    ).toEqual({
      subject: "invoice paid",
      older_than_days: 365,
      larger_than_bytes: 5 * 1024 * 1024,
      has_attachments: true,
      label: "Old receipts",
      unread: true,
      score_at_least: 3,
    })
    expect(() => filterMatch("from:alice@example.test")).toThrow(/not a field/)
    expect(() => filterMatch("older:soon")).toThrow(/needs days/)
  })

  it("reads one action, protection and tags from --do", () => {
    expect(actionsOf("envelope,tag:promo,tag:old")).toEqual({
      action: "envelope",
      protect: false,
      tags: ["promo", "old"],
    })
    expect(actionsOf("protect")).toEqual({ action: "keep", protect: true, tags: [] })
    expect(() => actionsOf("protect,skip")).toThrow(/choose skip, envelope, keep, protect/)
  })
})
