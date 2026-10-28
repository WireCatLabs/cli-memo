import { matches } from "@wirecat/cli-core/mail"
import { describe, expect, it } from "vitest"
import { importFilters } from "./filters.js"
import { actionsOf, filterMatch } from "./rule-query.js"

const NOW = Date.parse("2026-10-15T00:00:00Z")

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
