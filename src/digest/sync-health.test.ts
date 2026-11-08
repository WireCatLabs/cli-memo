import { expect, it } from "vitest"
import { healthOf } from "./sync-health.js"

const NOW = Date.parse("2026-11-08T12:00:00Z")
const DAY = 86_400_000
const ok = { at: "2026-11-08T04:30:00Z", exitCode: 0, output: "run.log" }
const failed = { at: "2026-11-08T04:30:00Z", exitCode: 1, output: "run.log", failingSince: "2026-11-06T04:30:00Z" }
const synced = { runs: [ok], scheduled: true, serving: false }

it("calls an account quiet only when its silence is long for its own pace", () => {
  expect(healthOf(synced, { newest: NOW - 4 * DAY, moved30d: 40 }, NOW)).toMatchObject({
    reason: "quiet",
    staleHours: 96,
  })
  expect(healthOf(synced, { newest: NOW - 10 * DAY, moved30d: 6 }, NOW)).toBeUndefined()
  expect(healthOf(synced, { newest: NOW - 20 * DAY, moved30d: 1 }, NOW)).toBeUndefined()
})

it("trusts a live serve or one good schedule over a failing one, and names an account nothing syncs", () => {
  const activity = { newest: NOW - DAY, moved30d: 3 }
  expect(healthOf({ runs: [failed], scheduled: true, serving: true }, activity, NOW)).toBeUndefined()
  expect(healthOf({ runs: [failed, ok], scheduled: true, serving: false }, activity, NOW)).toBeUndefined()
  expect(healthOf({ runs: [failed], scheduled: true, serving: false }, activity, NOW)).toEqual({
    reason: "sync-failed",
    since: failed.failingSince,
    staleHours: 55,
  })
  expect(healthOf({ runs: [], scheduled: false, serving: false }, activity, NOW)).toEqual({
    reason: "no-schedule",
    since: null,
    staleHours: 24,
  })
})
