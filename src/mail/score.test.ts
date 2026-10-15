import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { BOOTSTRAP_URL, knownAges, lookUpAges } from "./domain-age.js"
import { headersOf, mailHeadersOf } from "./headers.js"
import { domainsToAge, probeMail } from "./probe.js"
import { FREE_MAIL, scoreGroup, spoofedBrand, youngAt } from "./score.js"
import type { Listed } from "./source.js"

const head = (lines: string[]) => `${lines.join("\r\n")}\r\n`

const email = (n: number, header: string[], more: Partial<Listed> = {}): Listed => ({
  uid: String(n),
  messageId: String(n),
  threadId: String(n),
  receivedAt: "2026-06-01T00:00:00.000Z",
  size: 100,
  headers: headersOf(head(header)),
  ...more,
})

describe("Gmail's verdicts and Reply-To", () => {
  it("reads only the mx.google.com copy, and lets one passing DKIM signature count", () => {
    const headers = headersOf(
      head([
        "From: Alice Example <alice@shop.example>",
        "Reply-To: <Help@Other.example>",
        "Authentication-Results: relay.shop.example; dmarc=pass",
        "Authentication-Results: mx.google.com;",
        "       dkim=fail header.i=@shop.example;",
        "       dkim=pass header.i=@mail.shop.example;",
        "       spf=softfail (google.com: domain of alice@shop.example does not designate) smtp.mailfrom=alice@shop.example;",
        "       dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=shop.example",
      ]),
    )
    expect(headers).toMatchObject({
      from: "alice@shop.example",
      fromName: "Alice Example",
      replyTo: "help@other.example",
      auth: { dkim: "pass", spf: "softfail", dmarc: "fail" },
    })
  })

  it("trusts no verdict a sender wrote under another name", () => {
    const headers = headersOf(head(["From: bob@shop.example", "Authentication-Results: mx.shop.example; dmarc=pass"]))
    expect(headers.auth).toBeUndefined()
  })

  it("keeps the verdicts and Reply-To on mail stored in full", () => {
    const raw = Buffer.from(
      head([
        "From: bob@shop.example",
        "Reply-To: desk@shop.example",
        "Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=bob@shop.example; dkim=pass; dmarc=pass",
        "",
        "Hello",
      ]),
    )
    expect(mailHeadersOf(raw)).toEqual({ "reply-to": "desk@shop.example", spf: "pass", dkim: "pass", dmarc: "pass" })
  })
})

describe("scoreGroup", () => {
  const none = new Map()

  it("adds a failed DMARC, a spoofed brand and a Reply-To on another domain", () => {
    const scam = Array.from({ length: 3 }, (_, n) =>
      email(n, [
        "From: PayPal Support <alerts@pay-secure.example>",
        "Reply-To: claims@elsewhere.example",
        "Authentication-Results: mx.google.com; dmarc=fail",
      ]),
    )
    expect(scoreGroup(scam, { replied: false, bulk: 0, ages: none })).toEqual({
      score: 10,
      signals: ["dmarc_fail", "brand_spoof", "reply_to_elsewhere", "dkim_not_passed"],
    })
  })

  it("does not call a brand's own domain a spoof, and takes 5 off for a sender the owner replied to", () => {
    expect(spoofedBrand("PayPal", "service@mail.paypal.com")).toBeUndefined()
    expect(spoofedBrand("Apple Support", "help@gmail.com")).toBe("apple")
    const friend = [email(1, ["From: Bob Sample <bob@shop.example>"])]
    expect(scoreGroup(friend, { replied: true, bulk: 0, ages: none })).toEqual({ score: -5, signals: ["replied"] })
  })

  it("counts a domain young only when it was young at the first email, and a throwaway domain", () => {
    const ages = new Map([["new-shop.example", { created: "2026-03-01T00:00:00Z", checkedAt: "2026-10-01T00:00:00Z" }]])
    expect(youngAt(ages.get("new-shop.example"), "2026-06-01T00:00:00Z")).toBe(true)
    expect(youngAt(ages.get("new-shop.example"), "2027-06-01T00:00:00Z")).toBe(false)
    const fresh = [email(1, ["From: deals@new-shop.example"])]
    expect(scoreGroup(fresh, { replied: false, bulk: 1, ages }).signals).toEqual(["young_domain", "bulk_never_replied"])
    const throwaway = [email(2, ["From: someone@mailinator.com"])]
    expect(scoreGroup(throwaway, { replied: false, bulk: 0, ages }).signals).toEqual(["disposable_domain"])
  })

  it("adds mail never opened and a DKIM check most of the mail did not pass, and ignores unknowns", () => {
    const robot = [1, 2].map((n) =>
      email(n, ["From: deals@shop.example", "Authentication-Results: mx.google.com; spf=pass"], { seen: false }),
    )
    expect(scoreGroup(robot, { replied: false, bulk: 0, ages: none })).toEqual({
      score: 4,
      signals: ["never_opened", "dkim_not_passed"],
    })
    const opened = [
      email(1, ["From: deals@shop.example"], { seen: false }),
      email(2, ["From: deals@shop.example"], { seen: true }),
    ]
    expect(scoreGroup(opened, { replied: false, bulk: 0, ages: none }).signals).toEqual([])
    const unknown = [email(1, ["From: deals@shop.example"])]
    expect(scoreGroup(unknown, { replied: false, bulk: 0, ages: none }).signals).toEqual([])
  })

  it("marks a group whose mail sits in Gmail's Spam", () => {
    const spam = [email(1, ["From: win@prize.example"], { labels: ["Spam"] })]
    expect(scoreGroup(spam, { replied: false, bulk: 0, ages: none }).signals).toEqual(["spam_folder"])
  })

  it("puts the score on each probe group and asks ages only for never-replied, non-provider domains", () => {
    const probe = probeMail(
      [
        email(1, ["From: deals@shop.example", "Authentication-Results: mx.google.com; dkim=pass; dmarc=fail"]),
        email(2, ["From: carol@gmail.com"]),
        email(3, ["From: owner@example.test", "To: dave@friend.example"], { labels: ["Sent"] }),
        email(4, ["From: dave@friend.example"]),
      ],
      10,
    )
    expect(probe.items.map(({ from, score }) => ({ from, score }))).toEqual([
      { from: "deals@shop.example", score: 3 },
      { from: "carol@gmail.com", score: 0 },
      { from: "dave@friend.example", score: -5 },
    ])
    expect(domainsToAge(probe.items, FREE_MAIL)).toEqual(["shop.example"])
  })
})

describe("lookUpAges", () => {
  const services = { services: [[["example"], ["https://rdap.registry.example/v1/"]]] }
  const answer = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status })

  it("asks the domain's own registry once, a second apart, and keeps the answer for good", async () => {
    const env = { HOME: mkdtempSync(join(tmpdir(), "memo-age-")) }
    const asked: string[] = []
    const slept: number[] = []
    const deps = {
      now: () => new Date("2026-10-14T00:00:00Z"),
      sleep: async (ms: number) => {
        slept.push(ms)
      },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        asked.push(String(url))
        expect(new Headers(init?.headers).get("user-agent")).toMatch(/^cli-memo\//)
        if (String(url) === BOOTSTRAP_URL) return answer(200, services)
        if (String(url).endsWith("/old-shop.example"))
          return answer(200, { events: [{ eventAction: "registration", eventDate: "2015-05-05T00:00:00Z" }] })
        if (String(url).endsWith("/gone.example")) return answer(404)
        return answer(503)
      }) as typeof fetch,
    }

    const first = await lookUpAges(env, ["old-shop.example", "gone.example", "busy.example", "shop.test"], deps)

    expect(first).toEqual({ looked: 3, failed: 1 })
    expect(asked).toEqual([
      BOOTSTRAP_URL,
      "https://rdap.registry.example/v1/domain/old-shop.example",
      "https://rdap.registry.example/v1/domain/gone.example",
      "https://rdap.registry.example/v1/domain/busy.example",
    ])
    expect(slept).toEqual([1000, 1000])
    const ages = knownAges(env)
    expect(ages.get("old-shop.example")?.created).toBe("2015-05-05T00:00:00Z")
    expect(ages.get("gone.example")).toEqual({ checkedAt: "2026-10-14T00:00:00.000Z" })
    expect(ages.get("shop.test")?.unsupported).toBe(true)
    expect(ages.has("busy.example")).toBe(false)

    asked.length = 0
    await lookUpAges(env, ["old-shop.example", "gone.example"], deps)
    expect(asked).toEqual([])
    expect(readFileSync(join(env.HOME, ".local/share/cli-memo/domain-ages.json"), "utf8")).toContain("old-shop")
  })
})
