import { afterEach, expect, it } from "vitest"
import { ruleInput } from "./rule-store.js"

const processZone = process.env.TZ
afterEach(() => {
  process.env.TZ = processZone
})

it("reads a rule's decided_at date in the computer's zone, and keeps one with an offset", () => {
  process.env.TZ = "Asia/Vladivostok"
  const rule = { match: { from: "news@example.com" }, action: "skip" as const }
  expect(ruleInput({ ...rule, decided_at: "2026-09-01" }).decidedAt).toBe(Date.parse("2026-08-31T14:00:00Z"))
  expect(ruleInput({ ...rule, decided_at: "2026-09-01T10:00:00+02:00" }).decidedAt).toBe(
    Date.parse("2026-09-01T08:00:00Z"),
  )
})
