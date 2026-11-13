import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, isAbsolute, join } from "node:path"
import { captureStreams, resolvePaths } from "@wirecat/cli-base"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { APP } from "../app.js"
import { createProgram } from "../program.js"

const DAY = 86_400_000

afterEach(() => {
  process.exitCode = 0
})

const dateBack = (days: number) => {
  const day = new Date(Date.now() - days * DAY)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
}
const ahead = () => dateBack(-1)

/** The local run time of a day at 08:30 as a run file's stamp: `2026-11-05T07-30-00Z`. */
const stampOf = (date: string) =>
  new Date(`${date}T08:30:00`)
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z")

const setUp = (extra: NodeJS.ProcessEnv = {}) => {
  const root = mkdtempSync(join(tmpdir(), "memo-backfill-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // A schedule only starts the claude found on PATH: the fake must be that one.
    // pnpm puts ./node_modules/.bin on PATH, and a schedule refuses a relative entry.
    PATH: [root, ...(process.env.PATH ?? "").split(delimiter).filter((dir) => isAbsolute(dir))].join(delimiter),
    AI_AGENT: "",
    CLAUDECODE: "",
    MEMO_READ_ONLY: "",
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    ...extra,
  }
  const folder = join(
    resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state,
    "schedules",
    "morning-digest",
  )
  const runs = join(folder, "runs")
  mkdirSync(runs, { recursive: true })
  // Answers as claude's JSON does: a report for the day its input names, and the run's cost. It keeps its input.
  const claude = join(root, "claude")
  writeFileSync(
    claude,
    `#!${process.execPath}
const fs = require("node:fs")
if (process.env.FAKE_FAIL) process.exit(3)
const input = fs.readFileSync(0, "utf8")
fs.appendFileSync(__filename + ".inputs", input + "---\\n")
const date = /^backfill: (\\S+)/m.exec(input)[1]
const report = { format: "wirecat.report/1", kind: "morning-digest", date, summary: null, sections: [] }
process.stdout.write(JSON.stringify({ type: "result", result: JSON.stringify(report), total_cost_usd: 0.09 }))
`,
    { mode: 0o755 },
  )
  const last = { at: "2026-11-08T07:30:00.000Z", exitCode: 0, output: "x.md", costUsd: 0.09 }
  writeFileSync(
    join(folder, "schedule.json"),
    JSON.stringify({
      name: "morning-digest",
      kind: "agent",
      argv: [claude, "-p", "Run memo skill show morning-digest and follow it.", "--max-budget-usd", "0.5"],
      when: { daily: "08:30" },
      environment: {},
      createdAt: "",
      maxCostPerDay: 1,
      to: ["telegram-bot:personal/user:42"],
    }),
  )
  writeFileSync(join(folder, "last.json"), JSON.stringify(last))
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const inputs = () => (existsSync(`${claude}.inputs`) ? readFileSync(`${claude}.inputs`, "utf8") : "")
  return { run, folder, runs, inputs, last }
}

it("estimates the days without a digest at the last run's cost, and builds nothing", async () => {
  const { run, runs, inputs } = setUp()
  writeFileSync(join(runs, `${stampOf(dateBack(2))}.report.json`), "{}")
  const body = envelopeOf(
    await run("digest", "backfill", "--since-time", dateBack(3), "--until-time", dateBack(1), "--json"),
  )

  expect(body.item).toEqual({ days: [dateBack(3), dateBack(1)], skipped: [dateBack(2)], estimate_usd: 0.18 })
  expect(inputs()).toBe("")
})

it("takes the days under the names an older WireCat Desktop sends, --from and --to", async () => {
  const { run } = setUp()
  const old = envelopeOf(await run("digest", "backfill", "--from", dateBack(3), "--to", dateBack(1), "--json"))
  const now = envelopeOf(
    await run("digest", "backfill", "--since-time", dateBack(3), "--until-time", dateBack(1), "--json"),
  )
  expect(old.item).toEqual(now.item)
  expect(old.item.days).toHaveLength(3)
})

it("builds each day as that day's run, marked backfill, with its window, and leaves the last run", async () => {
  const { run, folder, runs, inputs, last } = setUp()
  const body = envelopeOf(
    await run(
      "digest",
      "backfill",
      "--since-time",
      dateBack(2),
      "--until-time",
      dateBack(1),
      "--yes",
      "--from-app",
      "--json",
    ),
  )

  expect(body.item).toMatchObject({ days: [dateBack(2), dateBack(1)], skipped: [], left: [], cost_usd: 0.18 })
  expect(body.item.built.map((one: { date: string; exit_code: number }) => [one.date, one.exit_code])).toEqual([
    [dateBack(2), 0],
    [dateBack(1), 0],
  ])
  const document = JSON.parse(readFileSync(join(runs, `${stampOf(dateBack(1))}.report.json`), "utf8"))
  expect(document).toMatchObject({ date: dateBack(1), backfill: true })
  const at = new Date(`${dateBack(1)}T08:30:00`)
  const window = `--since-time ${new Date(at.getTime() - DAY).toISOString()} --before-time ${at.toISOString()}`
  expect(inputs()).toContain(`backfill: ${dateBack(1)}\nwindow: ${window}\n`)
  expect(JSON.parse(readFileSync(join(folder, "last.json"), "utf8"))).toEqual(last)
  expect(existsSync(join(folder, "latest.md"))).toBe(false)
})

it("stops starting days once today's runs cost the schedule's daily cap", async () => {
  const { run, folder, inputs } = setUp()
  writeFileSync(join(folder, "spend.json"), JSON.stringify({ day: dateBack(0), usd: 0.95 }))
  const body = envelopeOf(
    await run(
      "digest",
      "backfill",
      "--since-time",
      dateBack(2),
      "--until-time",
      dateBack(1),
      "--yes",
      "--from-app",
      "--json",
    ),
  )

  expect(body.item.built.map((one: { date: string }) => one.date)).toEqual([dateBack(2)])
  expect(body.item.left).toEqual([dateBack(1)])
  expect(inputs().match(/backfill:/g)).toHaveLength(1)
})

it("stops at a failed day, so a broken harness is not paid for every day", async () => {
  const { run, inputs } = setUp({ FAKE_FAIL: "1" })
  const body = envelopeOf(
    await run(
      "digest",
      "backfill",
      "--since-time",
      dateBack(2),
      "--until-time",
      dateBack(1),
      "--yes",
      "--from-app",
      "--json",
    ),
  )

  expect(body.item.built).toEqual([expect.objectContaining({ date: dateBack(2), exit_code: 3 })])
  expect(body.item.left).toEqual([dateBack(1)])
  expect(process.exitCode).toBe(1)
  expect(inputs()).toBe("")
})

it("is the owner's alone: an agent and the read-only lock are refused before anything runs", async () => {
  const agent = setUp({ AI_AGENT: "claude-code_2-1-296_agent" })
  await expect(
    agent.run("digest", "backfill", "--since-time", dateBack(2), "--until-time", dateBack(1), "--yes"),
  ).rejects.toThrow(/owner's money/)
  expect(agent.inputs()).toBe("")
  const locked = setUp({ MEMO_READ_ONLY: "1" })
  await expect(
    locked.run("digest", "backfill", "--since-time", dateBack(2), "--until-time", dateBack(1)),
  ).rejects.toThrow(/MEMO_READ_ONLY/)
})

it("refuses a day whose run time is still ahead, and a range the wrong way round", async () => {
  const { run } = setUp()
  await expect(run("digest", "backfill", "--since-time", dateBack(1), "--until-time", ahead())).rejects.toThrow(
    /has not come yet/,
  )
  await expect(run("digest", "backfill", "--since-time", dateBack(1), "--until-time", dateBack(2))).rejects.toThrow(
    /after --until-time/,
  )
  await expect(run("digest", "backfill", "--since-time", "2026-02-30", "--until-time", dateBack(1))).rejects.toThrow(
    /YYYY-MM-DD/,
  )
})
