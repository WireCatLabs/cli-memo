import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { BOOTSTRAP_URL, knownAges, lookUpAges } from "./domain-age.js"

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
