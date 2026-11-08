import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { healthOf, syncRunsOf } from "./sync-health.js"

const NOW = Date.parse("2026-11-08T12:00:00Z")
const DAY = 86_400_000
const ok = { at: "2026-11-08T04:30:00Z", exitCode: 0, output: "run.log" }
const failed = { at: "2026-11-08T04:30:00Z", exitCode: 1, output: "run.log", failingSince: "2026-11-06T04:30:00Z" }
const synced = { runs: [ok], scheduled: true, serving: false, known: true }
const unsynced = { runs: [], scheduled: false, serving: false, known: true }
const stale = (newest: number | null, moved30d = 3) => ({ newest, moved30d, storedAt: NOW - 2 * DAY })

const machine = () => {
  const root = mkdtempSync(join(tmpdir(), "memo-health-"))
  const write = (path: string, value: unknown) => {
    const file = join(root, path)
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
  }
  const env = { ...process.env, XDG_DATA_HOME: join(root, "data"), XDG_CONFIG_HOME: join(root, "config") }
  return { env, write }
}

it("names no account stored or synced within a day, whatever its schedules", () => {
  expect(healthOf(unsynced, { newest: NOW - 2 * DAY, moved30d: 3, storedAt: NOW - DAY / 2 }, NOW)).toBeUndefined()
  const failedThenOk = { ...synced, runs: [failed, { ...ok, at: "2026-11-08T08:00:00Z" }] }
  expect(healthOf(failedThenOk, stale(NOW - 20 * DAY, 40), NOW)).toBeUndefined()
})

it("calls an account quiet only when its silence is long for its own pace", () => {
  const old = { ...synced, runs: [{ ...ok, at: "2026-11-06T04:30:00Z" }] }
  expect(healthOf(old, stale(NOW - 4 * DAY, 40), NOW)).toMatchObject({ reason: "quiet", staleHours: 96 })
  expect(healthOf(old, stale(NOW - 10 * DAY, 6), NOW)).toBeUndefined()
  expect(healthOf(old, stale(NOW - 20 * DAY, 1), NOW)).toBeUndefined()
})

it("trusts a live serve over a failing schedule, names a failure from its start, and an old account nothing syncs", () => {
  expect(healthOf({ ...synced, runs: [failed], serving: true }, stale(NOW - DAY), NOW)).toBeUndefined()
  expect(healthOf({ ...synced, runs: [failed] }, stale(NOW - DAY), NOW)).toEqual({
    reason: "sync-failed",
    since: failed.failingSince,
    staleHours: 55,
  })
  expect(healthOf(unsynced, stale(NOW - 15 * DAY), NOW)).toEqual({
    reason: "no-schedule",
    since: null,
    staleHours: 360,
  })
  expect(healthOf(unsynced, stale(null, 0), NOW)).toMatchObject({ reason: "no-schedule", staleHours: 48 })
})

it("leaves out an account no profile holds rather than call it unscheduled", () => {
  expect(healthOf({ ...unsynced, known: false }, stale(NOW - 15 * DAY), NOW)).toBeUndefined()
})

it("credits a tool's schedule to the profile it runs as, by its environment or its first argument", () => {
  const { env, write } = machine()
  write("data/tg-cli/accounts/personal.json", { account: "100" })
  write("data/tg-cli/accounts/second.json", { account: "200" })
  write("data/tg-cli/accounts/old.json", { account: "300" })
  const schedule = (name: string, argv: string[], environment: Record<string, string>) => {
    write(`data/tg-cli/schedules/${name}/schedule.json`, { name, kind: "command", argv, environment })
    write(`data/tg-cli/schedules/${name}/last.json`, { ...ok, output: "run.log" })
  }
  schedule("full-sync", ["messages", "sync", "--all"], { TG_PROFILE: "personal" })
  schedule("second-sync", ["second", "messages", "sync"], {})
  const runs = syncRunsOf(env)
  expect(runs({ provider: "telegram", account: "100" })).toMatchObject({ scheduled: true, known: true })
  expect(runs({ provider: "telegram", account: "200" })).toMatchObject({ scheduled: true, known: true })
  expect(runs({ provider: "telegram", account: "300" })).toEqual({
    runs: [],
    scheduled: false,
    serving: false,
    known: true,
  })
  expect(runs({ provider: "telegram", account: "999" })).toMatchObject({ known: false })
})

it("counts a running serve as what keeps its profile's account synced", () => {
  const { env, write } = machine()
  write("data/whatsapp-cli/accounts/personal.json", { account: "1@lid" })
  write("data/whatsapp-cli/serve/personal.lock", { pid: process.pid, startedAt: new Date().toISOString() })
  expect(syncRunsOf(env)({ provider: "whatsapp", account: "1@lid" })).toMatchObject({
    serving: true,
    scheduled: false,
    known: true,
  })
})
