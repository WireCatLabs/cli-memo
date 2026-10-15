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
  it("turns hiding filters into envelope rules and labels into tags, in the shapes Google writes", () => {
    const file = JSON.stringify([
      { criteria: { from: "news@shop.example" }, action: { removeLabelIds: ["INBOX"], addLabelIds: ["Label_7"] } },
      { from: "@club.example", label: "Club", shouldMarkAsRead: "true" },
      { criteria: { subject: "Invoice" }, action: { addLabelIds: ["Label_9"] } },
      { criteria: { from: "a@x.example OR b@y.example" }, action: { removeLabelIds: ["INBOX"] } },
      { criteria: { from: "a@x.example", negatedQuery: "urgent" }, action: { removeLabelIds: ["INBOX"] } },
    ])
    const { rules, skipped } = importFilters(file, "Filters.json", new Date(NOW))
    expect(rules).toMatchObject([
      { match: { from: "news@shop.example" }, action: "envelope", tags: ["Label_7"], source: "gmail-filter" },
      { match: { domain: "club.example" }, action: "envelope", tags: ["Club"] },
      { match: { subject: "Invoice" }, action: "keep", tags: ["Label_9"] },
      { match: { from: "a@x.example" }, action: "envelope" },
      { match: { from: "b@y.example" }, action: "envelope" },
    ])
    expect(skipped.map(({ why }) => why)).toEqual(["it excludes words, which memo rules cannot do"])
  })

  it("reads a Takeout Filters.json: from: and to: terms, one rule each, and words as subject words", () => {
    const file = JSON.stringify({
      filter: [
        { query: "to:alice@example.test", labelsToAdd: ["Family"], labelsToRemove: ["Inbox"] },
        { query: "to:alice@example.test to:bob@example.test", labelsToAdd: ["Kids"] },
        { query: "from:news@shop.example from:deals@shop.example", labelsToRemove: ["INBOX"] },
        { query: "from:club.example from:sample", labelsToAdd: ["TRASH"] },
        { query: "from:Example", labelsToAdd: ["Brand"] },
        { query: "newsletter", labelsToRemove: ["INBOX", "UNREAD"] },
        { query: "list:weekly.example", labelsToRemove: ["INBOX"] },
        { query: "from:someone@example.test", labelsToAdd: ["IMPORTANT"] },
      ],
    })
    const { rules, skipped } = importFilters(file, "Filters.json", new Date(NOW))
    expect(rules.map(({ match, action, tags }) => ({ match, action, tags }))).toEqual([
      { match: { to: "alice@example.test" }, action: "envelope", tags: ["Family"] },
      { match: { to: "alice@example.test" }, action: "keep", tags: ["Kids"] },
      { match: { to: "bob@example.test" }, action: "keep", tags: ["Kids"] },
      { match: { from: "news@shop.example" }, action: "envelope", tags: undefined },
      { match: { from: "deals@shop.example" }, action: "envelope", tags: undefined },
      { match: { domain: "club.example" }, action: "envelope", tags: undefined },
      { match: { from_contains: "sample" }, action: "envelope", tags: undefined },
      { match: { from_contains: "Example" }, action: "keep", tags: ["Brand"] },
      { match: { subject: "newsletter" }, action: "envelope", tags: undefined },
    ])
    expect(rules.find(({ match }) => match.subject)?.reason).toMatch(/memo matches the subject/)
    expect(skipped.map(({ why }) => why)).toEqual([
      "it uses list:, which this import does not map",
      "it does nothing memo can mirror",
    ])
  })

  it("matches a sender word in the address or the display name, and a recipient among To and Cc", () => {
    const headers = { from: "anna@mail.example", fromName: "Anna Sample", to: ["me@example.test"], bulk: false }
    expect(matches({ from_contains: "sample" }, { headers })).toBe(true)
    expect(matches({ from_contains: "MAIL" }, { headers })).toBe(true)
    expect(matches({ from_contains: "other" }, { headers })).toBe(false)
    expect(matches({ to: "Me@example.test" }, { headers })).toBe(true)
    expect(matches({ to: "you@example.test" }, { headers })).toBe(false)
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
    expect(filterMatch("from:Alice@example.test")).toEqual({ from: "alice@example.test" })
    expect(filterMatch("from:@shop.example to:me@example.test")).toEqual({
      domain: "shop.example",
      to: "me@example.test",
    })
    expect(filterMatch("from:sample")).toEqual({ from_contains: "sample" })
    expect(() => filterMatch("to:sample")).toThrow(/needs one address/)
    expect(() => filterMatch("list:weekly.example")).toThrow(/not a field/)
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
