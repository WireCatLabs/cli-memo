import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, resolvePaths } from "@wirecat/cli-base"
import type { Ran, ServerSystem } from "@wirecat/cli-core/background"
import { afterEach, describe, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { APP } from "../app.js"
import { createProgram } from "../program.js"
import { windowStart } from "./digests.js"

const ROUTE = "telegram-bot:personal/user:42"
const OTHER = "email:work/me@example.test"

afterEach(() => {
  process.exitCode = 0
})

const setUp = () => {
  const root = mkdtempSync(join(tmpdir(), "memo-digests-"))
  const bin = join(root, "bin")
  mkdirSync(bin)
  // Answers as claude's JSON does: an empty report, and the run's cost.
  writeFileSync(
    join(bin, "claude"),
    `#!${process.execPath}
const report = { format: "wirecat.report/1", kind: "morning-digest", date: "2026-11-09", summary: null, sections: [] }
process.stdout.write(JSON.stringify({ type: "result", result: JSON.stringify(report), total_cost_usd: 0.05 }))
`,
    { mode: 0o755 },
  )
  for (const name of ["tg", "mail"]) writeFileSync(join(bin, name), "#!/bin/sh\n", { mode: 0o755 })
  const env: NodeJS.ProcessEnv = {
    // Only the fake claude: a new digest with no --agent takes the one agent installed.
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: join(root, "home"),
    AI_AGENT: "",
    CLAUDECODE: "",
    MEMO_READ_ONLY: "",
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    XDG_STATE_HOME: join(root, "state"),
  }
  const ran: string[][] = []
  const system: ServerSystem = {
    platform: "linux",
    uid: 501,
    entry: [process.execPath, "/opt/memo.js"],
    spawn: () => 0,
    pause: async () => {},
    run: async (argv): Promise<Ran> => {
      ran.push(argv)
      return { code: 0, stdout: "", stderr: "" }
    },
  }
  const state = resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, system }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const json = async (...args: string[]) => envelopeOf(await run(...args, "--json"))
  const timer = (name: string) =>
    readFileSync(join(env.XDG_CONFIG_HOME ?? "", "systemd", "user", `memo-schedule-${name}.timer`), "utf8")
  const schedule = (name: string) => JSON.parse(readFileSync(join(state, "schedules", name, "schedule.json"), "utf8"))
  return { env, ran, run, json, timer, schedule, state }
}

/** The morning digest as WireCat Desktop made it before digests had names. */
const morningDigest = (state: string, claude: string) => {
  const folder = join(state, "schedules", "morning-digest")
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, "schedule.json"),
    JSON.stringify({
      name: "morning-digest",
      kind: "agent",
      argv: [claude, "-p", "Run memo skill show morning-digest and follow it.", "--max-budget-usd", "0.5"],
      when: { daily: "08:30" },
      environment: {},
      createdAt: "2026-11-01T00:00:00.000Z",
      to: [ROUTE],
    }),
  )
  return folder
}

describe("digests by name", () => {
  it("adds a daily digest twice a day and a weekly one, and lists them after the morning digest", async () => {
    const { json, timer, schedule, state, env } = setUp()
    morningDigest(state, "claude")
    const twice = await json(
      "digest",
      "add",
      "twice",
      "--title",
      "Twice a day",
      "--at",
      "18:00",
      "--at",
      "08:30",
      "--deliver-to",
      ROUTE,
      "--max-cost",
      "0.4",
      "--from-app",
    )
    expect(twice.item).toMatchObject({
      name: "twice",
      title: "Twice a day",
      times: ["08:30", "18:00"],
      weekdays: [],
      sources: [],
      routes: [ROUTE],
      scheduled: true,
      max_cost_usd: 0.4,
      last: null,
    })
    expect(timer("twice")).toContain("OnCalendar=*-*-* 08:30:00\nOnCalendar=*-*-* 18:00:00")
    expect(schedule("twice").argv).toContain("Run memo skill show morning-digest and follow it.")

    await json("digest", "add", "weekly", "--at", "mon 09:00", "--source", "telegram,mail", "--from-app")
    expect(timer("weekly")).toContain("OnCalendar=Mon *-*-* 09:00:00")

    const listed = await json("digest", "list")
    expect(listed.items.map((one: { name: string }) => one.name)).toEqual(["morning-digest", "twice", "weekly"])
    expect(listed.items[0]).toMatchObject({ title: "Morning digest", times: ["08:30"], routes: [ROUTE] })
    expect(listed.items[2]).toMatchObject({
      weekdays: ["mon"],
      sources: ["telegram", "mail"],
      next_at: expect.any(String),
    })
    expect(existsSync(join(state, "schedules", "morning-digest", "schedule.json"))).toBe(true)
    expect(env.MESSAGING_STORE).toBeDefined()
  })

  it("refuses a name in use, no time, and a source it cannot read", async () => {
    const { run, state } = setUp()
    morningDigest(state, "claude")
    await expect(run("digest", "add", "morning-digest", "--at", "08:30", "--from-app")).rejects.toThrow(
      "already exists",
    )
    await expect(run("digest", "add", "x", "--from-app")).rejects.toThrow("say when")
    await expect(run("digest", "add", "x", "--at", "08:30", "--source", "fax", "--from-app")).rejects.toThrow(
      "--source takes",
    )
  })

  it("is the owner's: an agent cannot add one", async () => {
    const { env, run } = setUp()
    env.AI_AGENT = "claude"
    await expect(run("digest", "add", "x", "--at", "08:30")).rejects.toThrow()
    env.AI_AGENT = ""
  })

  it("edits what is given, clears with all and none, and keeps the rest", async () => {
    const { json, schedule } = setUp()
    await json("digest", "add", "d", "--at", "08:30", "--source", "mail", "--deliver-to", ROUTE, "--from-app")
    const edited = await json("digest", "edit", "d", "--at", "mon,fri 07:00", "--title", "Two days", "--from-app")
    expect(edited.item).toMatchObject({
      title: "Two days",
      times: ["07:00"],
      weekdays: ["mon", "fri"],
      sources: ["mail"],
    })
    expect(edited.item.routes).toEqual([ROUTE])
    const cleared = await json("digest", "edit", "d", "--source", "all", "--deliver-to", "none", "--from-app")
    expect(cleared.item).toMatchObject({ sources: [], routes: [] })
    expect(schedule("d").to).toBeUndefined()
    const capped = await json(
      "digest",
      "edit",
      "d",
      "--text",
      "Only money.",
      "--max-cost",
      "0.3",
      "--max-cost-per-day",
      "1",
      "--from-app",
    )
    expect(capped.item).toMatchObject({
      brief: "Only money.",
      max_cost_usd: 0.3,
      max_cost_per_day_usd: 1,
      times: ["07:00"],
    })
  })

  it("runs with codex and a model the owner names, and an edit to the other agent drops the old model", async () => {
    const { json, schedule, env } = setUp()
    writeFileSync(join(String(env.PATH).split(":")[0] ?? "", "codex"), "#!/bin/sh\n", { mode: 0o755 })
    const added = await json(
      "digest",
      "add",
      "d",
      "--at",
      "08:30",
      "--agent",
      "codex",
      "--model",
      "qwen3",
      "--from-app",
    )
    expect(added.item).toMatchObject({ harness: "codex", model: "qwen3" })
    expect(schedule("d").argv.slice(1, 2)).toEqual(["exec"])
    expect(schedule("d").argv).toContain("qwen3")
    const kept = await json("digest", "edit", "d", "--at", "09:00", "--from-app")
    expect(kept.item).toMatchObject({ harness: "codex", model: "qwen3" })
    const back = await json("digest", "edit", "d", "--agent", "claude", "--from-app")
    expect(back.item.harness).toBe("claude")
    expect(schedule("d").argv).not.toContain("qwen3")
  })

  it("takes the one agent installed, asks when there are none or several, and never caps an agent that reports no cost", async () => {
    const { json, schedule, env } = setUp()
    const bin = String(env.PATH).split(":")[0] ?? ""
    expect((await json("digest", "add", "only", "--at", "08:30", "--from-app")).item.harness).toBe("claude")
    writeFileSync(join(bin, "gemini"), "#!/bin/sh\n", { mode: 0o755 })
    await expect(json("digest", "add", "two", "--at", "08:30", "--from-app")).rejects.toMatchObject({
      details: { reason: "digest.agent-unchosen", choices: ["claude", "gemini"] },
    })
    await expect(
      json("digest", "add", "capped", "--at", "08:30", "--agent", "gemini", "--max-cost", "1", "--from-app"),
    ).rejects.toMatchObject({ details: { reason: "agent.cost-unknown" } })
    expect((await json("digest", "edit", "only", "--at", "09:00", "--from-app")).item.harness).toBe("claude")
    const moved = await json("digest", "edit", "only", "--agent", "gemini", "--from-app")
    expect(moved.item).toMatchObject({ harness: "gemini", max_cost_usd: null })
    expect(schedule("only").argv[0]).toMatch(/gemini$/)
    expect((await json("digest", "edit", "only", "--at", "10:00", "--from-app")).item.harness).toBe("gemini")
    await expect(json("digest", "edit", "only", "--max-cost-per-day", "2", "--from-app")).rejects.toMatchObject({
      details: { reason: "agent.cost-unknown" },
    })
  })

  it("asks for an agent when none is installed", async () => {
    const { json, env } = setUp()
    env.PATH = "/usr/bin:/bin"
    await expect(json("digest", "add", "none", "--at", "08:30", "--from-app")).rejects.toMatchObject({
      details: { reason: "digest.agent-unchosen" },
    })
  })

  it("keeps each digest's brief apart, the morning digest's where it was", async () => {
    const { json, state } = setUp()
    morningDigest(state, "claude")
    await json("digest", "add", "weekly", "--at", "mon 09:00", "--text", "Only money.", "--from-app")
    expect((await json("digest", "brief", "show", "weekly")).item.body).toBe("Only money.")
    expect((await json("digest", "brief", "show")).item.body).toBeNull()
    expect((await json("digest", "list")).items[1]).toMatchObject({ name: "weekly", brief: "Only money." })
  })

  it("pauses and resumes: the timer goes and comes back, the digest stays", async () => {
    const { json, env } = setUp()
    await json("digest", "add", "d", "--at", "08:30", "--paused", "--from-app")
    const timers = join(env.XDG_CONFIG_HOME ?? "", "systemd", "user")
    expect(existsSync(join(timers, "memo-schedule-d.timer"))).toBe(false)
    expect((await json("digest", "list")).items[0]).toMatchObject({ scheduled: false, next_at: null })
    expect((await json("digest", "resume", "d", "--from-app")).item).toMatchObject({ scheduled: true })
    expect(existsSync(join(timers, "memo-schedule-d.timer"))).toBe(true)
    expect((await json("digest", "pause", "d", "--from-app")).item).toMatchObject({ scheduled: false })
  })

  it("runs now: along its routes, only some, or nowhere; a paused one too; never to a route it lacks", async () => {
    const { json, run, ran } = setUp()
    await json("digest", "add", "d", "--at", "08:30", "--deliver-to", ROUTE, "--deliver-to", OTHER, "--from-app")
    await json("digest", "pause", "d", "--from-app")
    const sends = () => ran.filter((argv) => argv[0]?.endsWith("tg") || argv[0]?.endsWith("mail"))

    const kept = await json("digest", "run", "d", "--no-notify", "--from-app")
    expect(kept.item).toMatchObject({ name: "d", exit_code: 0 })
    expect(sends()).toEqual([])

    const one = await json("digest", "run", "d", "--deliver-to", OTHER, "--from-app")
    expect(one.item.deliveries.map((delivery: { to: string }) => delivery.to)).toEqual([OTHER])

    await expect(
      run("digest", "run", "d", "--deliver-to", "telegram-bot:personal/user:7", "--from-app"),
    ).rejects.toThrow("only d's own routes")
    expect((await json("digest", "list")).items[0].last).toMatchObject({ ok: true, cost_usd: 0.05 })
  })

  it("removes a digest and its timer", async () => {
    const { json, run } = setUp()
    await json("digest", "add", "d", "--at", "08:30", "--from-app")
    expect((await json("digest", "remove", "d", "--from-app")).item).toEqual({ name: "d", removed: true })
    expect((await json("digest", "list")).items).toEqual([])
    await expect(run("digest", "run", "d", "--from-app")).rejects.toThrow("no digest d")
  })

  it("tells a scheduled run of a named digest its window, sources and brief; the morning digest its brief alone", async () => {
    const { json, run, env, state } = setUp()
    morningDigest(state, "claude")
    await json(
      "digest",
      "add",
      "weekly",
      "--at",
      "mon 09:00",
      "--source",
      "mail",
      "--text",
      "Only money.",
      "--from-app",
    )

    env.MEMO_SCHEDULED = "weekly"
    const weekly = await run("skill", "show", "morning-digest")
    expect(weekly).toContain("## This digest: weekly")
    expect(weekly).toMatch(/memo review agenda --compact --since-time \S+ --source mail/)
    expect(weekly).toContain("Only money.")

    env.MEMO_SCHEDULED = "morning-digest"
    const morning = await run("skill", "show", "morning-digest")
    expect(morning).not.toContain("## This digest")
    expect(morning).not.toContain("Only money.")
    delete env.MEMO_SCHEDULED
  })
})

describe("digests after other changes", () => {
  it("lists one digest by name:", async () => {
    const { json } = setUp()
    await json("digest", "add", "a", "--at", "08:30", "--from-app")
    await json("digest", "add", "b", "--at", "09:00", "--from-app")
    expect((await json("digest", "list", "name:b")).items.map(({ name }: { name: string }) => name)).toEqual(["b"])
  })

  it("refuses a name shaped like a path", async () => {
    const { run } = setUp()
    await expect(run("digest", "run", "../../x", "--no-notify", "--from-app")).rejects.toThrow("no digest")
  })

  it("drops a digest whose schedule another command removed, and adds one of that name again", async () => {
    const { json } = setUp()
    await json("digest", "add", "d", "--at", "08:30", "--from-app")
    await json("schedule", "remove", "d")
    expect((await json("digest", "list")).items).toEqual([])
    expect((await json("digest", "add", "d", "--at", "09:00", "--from-app")).item).toMatchObject({ times: ["09:00"] })
  })

  it("tells the morning digest its window once it runs twice a day", async () => {
    const { json, run, env, state } = setUp()
    morningDigest(state, "claude")
    await json("digest", "edit", "morning-digest", "--at", "08:30", "--at", "18:00", "--from-app")
    env.MEMO_SCHEDULED = "morning-digest"
    expect(await run("skill", "show", "morning-digest")).toContain("## This digest: Morning digest")
    delete env.MEMO_SCHEDULED
  })
})

describe("a digest's window", () => {
  const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime()

  it("reads a day, a week, or since its other time of the day", () => {
    expect(windowStart({ daily: "08:30" }, local(9, 8, 31))).toBe(local(8, 8, 30))
    // 2026-11-09 is a Monday.
    expect(windowStart({ weekly: "09:00", on: "mon" }, local(9, 9, 5))).toBe(local(2, 9))
    const twice = { calendar: [{ at: "08:30" }, { at: "18:00" }] }
    expect(windowStart(twice, local(9, 18, 1))).toBe(local(9, 8, 30))
    expect(windowStart(twice, local(9, 8, 31))).toBe(local(8, 18))
  })
})
