import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { beforeEach, describe, expect, it } from "vitest"
import { loadConfig, updateConfig } from "../config.js"
import { createProgram } from "../program.js"

let env: NodeJS.ProcessEnv
let dir: string

const units = () => join(dir, "xdg", "systemd", "user")
const calls = () => (existsSync(join(dir, "systemctl.log")) ? readFileSync(join(dir, "systemctl.log"), "utf8") : "")

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auto-"))
  const vault = join(dir, "vault")
  mkdirSync(vault)
  writeFileSync(join(vault, "a.md"), "synthetic note")
  env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, "xdg"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_SYSTEMCTL_LOG: join(dir, "systemctl.log"),
  }
  updateConfig(() => ({ notes: { folders: [vault] } }), env)
})

describe("memo auto", () => {
  it("installs a timer with the interval asked for, and remembers it in the config", async () => {
    await run("auto", "on", "--every", "2m")

    expect(readFileSync(join(units(), "memo-import.timer"), "utf8")).toContain("OnUnitActiveSec=2min")
    expect(readFileSync(join(units(), "memo-import.service"), "utf8")).toMatch(/ExecStart=".*" ".*memo\.js" "import"/)
    expect(calls()).toContain("--user enable --now memo-import.timer")
    expect(loadConfig(env).auto).toEqual({ enabled: true, every: "2m" })
  })

  it("leaves a timer that already matches the config alone", async () => {
    await run("auto", "on")
    writeFileSync(join(dir, "systemctl.log"), "")

    await run("auto", "on")

    expect(calls()).toBe("")
  })

  it("refuses an interval under a minute", async () => {
    await expect(run("auto", "on", "--every", "30s")).rejects.toThrow()
  })

  it("removes the timer when turned off", async () => {
    await run("auto", "on")

    await run("auto", "off")

    expect(existsSync(join(units(), "memo-import.timer"))).toBe(false)
    expect(calls()).toContain("--user disable --now memo-import.timer")
    expect(loadConfig(env).auto?.enabled).toBe(false)
  })

  it("follows a hand edit of the config at the next timer run", async () => {
    await run("auto", "on", "--every", "5m")
    updateConfig((config) => ({ ...config, auto: { enabled: true, every: "15m" } }), env)

    await run("import")
    expect(readFileSync(join(units(), "memo-import.timer"), "utf8")).toContain("OnUnitActiveSec=5min")

    env = { ...env, MEMO_AUTO: "1" }
    await run("import")
    expect(readFileSync(join(units(), "memo-import.timer"), "utf8")).toContain("OnUnitActiveSec=15min")

    updateConfig((config) => ({ ...config, auto: { enabled: false } }), env)
    expect(await run("import")).toBe("")
    expect(existsSync(join(units(), "memo-import.timer"))).toBe(false)
  })

  it("shows whether the timer is on and when it runs next", async () => {
    await run("auto", "on")

    const status = JSON.parse(await run("auto", "status", "--json"))

    expect(status).toMatchObject({
      enabled: true,
      every: "5m",
      timer: "active",
      next: "2026-10-05T22:50:13.053Z",
      last: null,
    })
  })
})

describe("memo import", () => {
  it("names a folder with no id as failed, and imports it once it has one", async () => {
    expect(await run("import")).toMatch(/failed notes .*: no folder id — memo folders add/)
    process.exitCode = 0
    await run("folders", "add", join(dir, "vault"))
    expect(await run("import")).toMatch(/notes .*: 1 notes, 1 changed, 0 moved, 0 gone/)
    expect(await run("import")).toMatch(/1 notes, 0 changed/)
  })

  it("refuses to start while another import holds the lock", async () => {
    mkdirSync(join(dir, "state"), { recursive: true })
    writeFileSync(
      join(dir, "state", "import.lock"),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    )

    await expect(run("import")).rejects.toThrow("already running")
  })
})
