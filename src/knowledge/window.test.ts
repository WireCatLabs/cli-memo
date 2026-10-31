import { projectWindowOf as windowOf } from "@wirecat/cli-core/cli"
import { afterEach, expect, it } from "vitest"

const processZone = process.env.TZ
afterEach(() => {
  process.env.TZ = processZone
})

it("starts a date alone at local midnight, not UTC midnight", () => {
  process.env.TZ = "Asia/Vladivostok"
  expect(windowOf("2026-09-01")).toEqual({ after: Date.parse("2026-08-31T14:00:00Z") })
  expect(windowOf("2026-09-01T00:00:00Z")).toEqual({ after: Date.parse("2026-09-01T00:00:00Z") })
  expect(windowOf("90d")).toEqual({ days: 90 })
})
