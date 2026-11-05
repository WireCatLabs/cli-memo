import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { beforeEach, describe, expect, it } from "vitest"
import { configPath, scheduleLimits, updateConfig } from "./config.js"
import { createProgram } from "./program.js"

let env: NodeJS.ProcessEnv

const memo = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}
const file = () => readFileSync(configPath(env), "utf8")
const write = (config: unknown) => {
  mkdirSync(dirname(configPath(env)), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify(config))
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "memo-config-"))
  env = { ...process.env, HOME: dir, MEMO_CONFIG_DIR: join(dir, "config"), MEMO_STATE_DIR: join(dir, "state") }
})

describe("memo config show and migrate", () => {
  it("shows each setting with its default and where it came from, without writing the file", async () => {
    write({ update_check: false, future_key: 1 })
    const before = file()
    const { item } = JSON.parse(await memo("config", "show", "--json"))
    expect(item.settings).toContainEqual(
      expect.objectContaining({ setting: "agent_decisions", value: false, from: "default" }),
    )
    expect(item.settings).toContainEqual(
      expect.objectContaining({ setting: "update_check", value: false, default: true, from: "config file" }),
    )
    expect(file()).toBe(before)
  })

  it("migrate writes what the file lacks, keeps the owner's values and unknown keys, and leaves no section new", async () => {
    write({ agent_decisions: true, future_key: 1, notes: { folders: [] } })
    const { item } = JSON.parse(await memo("config", "migrate", "--json"))
    const saved = JSON.parse(file())
    expect(item.added).toContain("update_check")
    expect(saved).toMatchObject({ agent_decisions: true, future_key: 1, update_check: true, notes: { embed: true } })
    expect(saved.mail).toBeUndefined()
    expect(Object.keys(saved).slice(0, 3)).toEqual(["agent_decisions", "future_key", "notes"])
    expect(JSON.parse(await memo("config", "migrate", "--json")).item.added).toEqual([])
  })

  it("writes the agent schedule limits at their defaults, and a value the owner sets reaches the schedule", async () => {
    write({})
    await memo("config", "migrate", "--json")
    expect(JSON.parse(file())).toMatchObject({
      schedule_mail_wait: "30m",
      schedule_mail_batch: 10,
      schedule_max_cost_per_day: 5,
      schedule_model_claude: "sonnet",
      schedule_model_codex: "",
      schedule_lean_start: true,
    })
    expect(scheduleLimits(env)).toEqual({
      mailWaitMinutes: 30,
      mailBatch: 10,
      maxCostPerDay: 5,
      models: { claude: "sonnet", codex: "" },
      leanStart: true,
    })
    write({
      schedule_mail_wait: "2h",
      schedule_mail_batch: 3,
      schedule_max_cost_per_day: 0,
      schedule_model_claude: "opus",
      schedule_lean_start: false,
    })
    expect(scheduleLimits(env)).toEqual({
      mailWaitMinutes: 120,
      mailBatch: 3,
      maxCostPerDay: 0,
      models: { claude: "opus" },
      leanStart: false,
    })
  })

  it("a write memo makes anyway adds the missing settings too", () => {
    write({})
    updateConfig((config) => ({ ...config, update_check: false }), env)
    expect(JSON.parse(file())).toMatchObject({ update_check: false, agent_decisions: false, keep_runs_for_days: 30 })
  })
})
