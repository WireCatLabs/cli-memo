import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import type { RunChild } from "../knowledge/messenger-sync.js"
import { catchUp, withTimeout } from "./catch-up.js"
import { syncRunsOf } from "./sync-health.js"

const NOW = Date.parse("2026-11-08T07:30:00Z")
const HOUR = 3_600_000

const machine = () => {
  const root = mkdtempSync(join(tmpdir(), "memo-catch-up-"))
  const bin = join(root, "bin")
  mkdirSync(bin)
  for (const tool of ["wcat-tg", "wcat-max", "wcat-mail"]) {
    writeFileSync(join(bin, tool), "#!/bin/sh\n")
    chmodSync(join(bin, tool), 0o755)
  }
  const env = { PATH: bin, XDG_DATA_HOME: join(root, "data"), XDG_CONFIG_HOME: join(root, "config") }
  const write = (path: string, value: unknown) => {
    const file = join(root, "data", path)
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
  }
  const schedule = (
    app: string,
    name: string,
    argv: string[],
    environment: Record<string, string>,
    when: unknown,
    lastAt: number,
  ) => {
    write(`${app}/schedules/${name}/schedule.json`, { name, kind: "command", argv, environment, when })
    write(`${app}/schedules/${name}/last.json`, { at: new Date(lastAt).toISOString(), exitCode: 0, output: "x.log" })
  }
  const calls: { bin: string; args: string[]; profile: string | undefined }[] = []
  const run =
    (code = 0): RunChild =>
    async (command, args, { env: childEnv }) => {
      if (args[0] === "--wcat-describe") return { code: 0, stdout: JSON.stringify({ name: command.split("wcat-")[1] }) }
      calls.push({ bin: command, args, profile: childEnv.TG_PROFILE ?? childEnv.MAX_PROFILE ?? childEnv.MAIL_PROFILE })
      return { code, stdout: "" }
    }
  return { env, write, schedule, calls, run, bin }
}

it("sets a schedule's --timeout to what the budget leaves, or adds one", () => {
  expect(withTimeout(["messages", "sync", "--all", "--timeout", "120m", "--record"], 230)).toEqual([
    "messages",
    "sync",
    "--all",
    "--timeout",
    "230s",
    "--record",
  ])
  expect(withTimeout(["sync", "--timeout=5m"], 60)).toEqual(["sync", "--timeout=60s"])
  expect(withTimeout(["sync"], 60)).toEqual(["sync", "--timeout", "60s"])
})

it("runs each owner's sync schedule that is behind, as its schedule says, and no other", async () => {
  const { env, schedule, calls, run, bin } = machine()
  schedule(
    "tg-cli",
    "full-sync",
    ["messages", "sync", "--all", "--timeout", "120m"],
    { TG_PROFILE: "personal" },
    { daily: "04:30" },
    NOW - 3 * HOUR,
  )
  schedule(
    "max-cli",
    "full-sync",
    ["messages", "sync", "--all"],
    { MAX_PROFILE: "main" },
    { daily: "04:45" },
    NOW - HOUR / 4,
  )
  schedule("mail-cli", "mail-home", ["sync"], { MAIL_PROFILE: "home" }, { every: 5 }, NOW - 3 * HOUR)
  schedule("tg-cli", "health", ["doctor"], { TG_PROFILE: "personal" }, { daily: "09:00" }, NOW - 3 * HOUR)

  const ran = await catchUp(env, { run: run(), now: () => NOW, budgetMs: 4 * 60_000 })

  expect(calls).toEqual([
    {
      bin: join(bin, "wcat-tg"),
      args: ["messages", "sync", "--all", "--timeout", "230s"],
      profile: "personal",
    },
  ])
  expect(ran).toEqual([{ app: "tg-cli", schedule: "full-sync", at: new Date(NOW).toISOString(), exitCode: 0 }])
})

it("keeps a failed catch-up so health counts it, and runs a caught-up schedule no sooner than an hour later", async () => {
  const { env, write, schedule, calls, run } = machine()
  write("tg-cli/accounts/personal.json", { account: "100" })
  schedule(
    "tg-cli",
    "full-sync",
    ["messages", "sync", "--all"],
    { TG_PROFILE: "personal" },
    { daily: "04:30" },
    NOW - 50 * HOUR,
  )

  await catchUp(env, { run: run(1), now: () => NOW })
  expect(syncRunsOf(env)({ provider: "telegram", account: "100" }).runs).toEqual([
    expect.objectContaining({ exitCode: 0 }),
    expect.objectContaining({ exitCode: 1, reason: "exit 1", at: new Date(NOW).toISOString() }),
  ])

  await catchUp(env, { run: run(0), now: () => NOW + HOUR / 2 })
  expect(calls).toHaveLength(2)
  await catchUp(env, { run: run(0), now: () => NOW + HOUR + HOUR / 4 })
  expect(calls).toHaveLength(2)
  await catchUp(env, { run: run(0), now: () => NOW + 2 * HOUR })
  expect(calls).toHaveLength(3)
})

it("starts no sync once too little of the budget is left", async () => {
  const { env, schedule, calls, run } = machine()
  schedule("tg-cli", "full-sync", ["messages", "sync"], { TG_PROFILE: "personal" }, { daily: "04:30" }, NOW - 3 * HOUR)
  await catchUp(env, { run: run(), now: () => NOW, budgetMs: 15_000 })
  expect(calls).toEqual([])
})
