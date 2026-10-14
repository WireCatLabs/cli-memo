import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { beforeEach, describe, expect, it } from "vitest"
import { loadConfig, updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { autoNotice, followInstall } from "./auto.js"

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
    await run("auto", "start", "--every", "2m")

    expect(readFileSync(join(units(), "memo-import.timer"), "utf8")).toContain("OnUnitActiveSec=2min")
    expect(readFileSync(join(units(), "memo-import.service"), "utf8")).toMatch(/ExecStart=".*" ".*memo\.js" "sync"/)
    expect(calls()).toContain("--user enable --now memo-import.timer")
    expect(loadConfig(env).auto).toMatchObject({ enabled: true, every: "2m" })
  })

  it("leaves a timer that already matches the config alone", async () => {
    await run("auto", "start")
    writeFileSync(join(dir, "systemctl.log"), "")

    await run("auto", "start")

    expect(calls()).toBe("")
  })

  it("refuses an interval under a minute", async () => {
    await expect(run("auto", "start", "--every", "30s")).rejects.toThrow()
  })

  it("removes the timer when turned off", async () => {
    await run("auto", "start")

    await run("auto", "stop")

    expect(existsSync(join(units(), "memo-import.timer"))).toBe(false)
    expect(calls()).toContain("--user disable --now memo-import.timer")
    expect(loadConfig(env).auto?.enabled).toBe(false)
  })

  it("follows a hand edit of the config at the next timer run", async () => {
    await run("auto", "start", "--every", "5m")
    updateConfig((config) => ({ ...config, auto: { enabled: true, every: "15m" } }), env)

    await run("sync")
    expect(readFileSync(join(units(), "memo-import.timer"), "utf8")).toContain("OnUnitActiveSec=5min")

    env = { ...env, MEMO_AUTO: "1" }
    await run("sync")
    expect(readFileSync(join(units(), "memo-import.timer"), "utf8")).toContain("OnUnitActiveSec=15min")

    updateConfig((config) => ({ ...config, auto: { enabled: false } }), env)
    expect(await run("sync")).toBe("")
    expect(existsSync(join(units(), "memo-import.timer"))).toBe(false)
  })

  it("passes the folders and store memo was started with to every timer run", async () => {
    await run("auto", "start")

    const unit = readFileSync(join(units(), "memo-import.service"), "utf8")
    expect(unit).toContain(`"MESSAGING_STORE=${join(dir, "messages.db")}"`)
    expect(unit).toContain(`"MEMO_CONFIG_DIR=${join(dir, "config")}"`)
    expect(loadConfig(env).auto?.places).toMatchObject({ MEMO_STATE_DIR: join(dir, "state") })
  })

  it("points the timer at the installed memo that ran last, and never at a checkout", async () => {
    await run("auto", "start")
    const service = join(units(), "memo-import.service")
    writeFileSync(
      service,
      readFileSync(service, "utf8").replace(/ExecStart=.*/, 'ExecStart="/gone/node" "/gone/memo.js" "sync"'),
    )

    await followInstall(env, "/home/someone/project/cli-memo/dist/bin/memo.js")
    expect(readFileSync(service, "utf8")).toContain("/gone/node")

    await followInstall({ ...env, MEMO_AUTO: "1" }, "/usr/lib/node_modules/@wirecat/cli-memo/dist/bin/memo.js")
    expect(readFileSync(service, "utf8")).toContain("/gone/node")

    await followInstall(env, "/usr/lib/node_modules/@wirecat/cli-memo/dist/bin/memo.js")
    expect(readFileSync(service, "utf8")).toContain(process.execPath)
  })

  it("shows whether the timer is on and when it runs next", async () => {
    await run("auto", "start")

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

describe("a failing timer run", () => {
  it("is said on every command until a timer run passes, and memo auto status shows the streak", async () => {
    updateConfig((config) => ({ ...config, auto: { enabled: true, every: "5m" } }), env)
    const timer = { ...env, MEMO_AUTO: "1" }
    const timerSync = () =>
      createProgram({ streams: captureStreams(), env: timer }).exitOverride().parseAsync(["sync"], { from: "user" })

    await timerSync()
    await timerSync()
    process.exitCode = 0

    expect(autoNotice(timer)).toBeUndefined()
    expect(autoNotice(env)).toMatch(
      /^memo: scheduled sync failing since .* \(2 runs\): notes .*vault.*has no folder id.* — memo auto status$/,
    )
    expect(JSON.parse(await run("auto", "status", "--json")).failing).toMatchObject({
      runs: 2,
      reason: expect.stringContaining("has no folder id"),
    })

    await run("folders", "add", join(dir, "vault"))
    await timerSync()

    expect(autoNotice(env)).toBeUndefined()
    expect(JSON.parse(await run("auto", "status", "--json")).failing).toBeNull()
  })

  it("is not recorded for a sync started by hand", async () => {
    await run("sync")
    process.exitCode = 0

    expect(autoNotice(env)).toBeUndefined()
  })
})

describe("memo sync", () => {
  it("names a folder with no id as failed, and imports it once it has one", async () => {
    expect(await run("sync")).toMatch(/failed notes .*has no folder id — memo folders add/)
    process.exitCode = 0
    await run("folders", "add", join(dir, "vault"))
    expect(await run("sync")).toMatch(/notes .*: 1 notes, 1 changed, 0 moved, 0 gone/)
    expect(await run("sync")).toMatch(/1 notes, 0 changed/)
  })

  it("lists memo sync and no longer memo import", async () => {
    const commands = await run("commands", "--json")
    expect(commands).toContain('"path":["sync"]')
    expect(commands).not.toContain('"path":["import"]')
  })

  it("refuses to start while another import holds the lock", async () => {
    mkdirSync(join(dir, "state"), { recursive: true })
    writeFileSync(
      join(dir, "state", "import.lock"),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    )

    await expect(run("sync")).rejects.toMatchObject({ code: "rate_limited", details: { reason: "sync.running" } })
  })

  it("skips a timer run while another sync holds the lock, and exits 0", async () => {
    mkdirSync(join(dir, "state"), { recursive: true })
    writeFileSync(
      join(dir, "state", "import.lock"),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    )
    updateConfig((config) => ({ ...config, auto: { enabled: true, every: "5m" } }), env)
    env = { ...env, MEMO_AUTO: "1" }
    process.exitCode = undefined
    const streams = captureStreams()

    await createProgram({ streams, env }).exitOverride().parseAsync(["sync", "--json"], { from: "user" })

    expect(process.exitCode).toBeUndefined()
    expect(streams.stderr.join("")).toBe(`memo sync skipped: another memo sync is running (process ${process.ppid})`)
    expect(JSON.parse(streams.stdout.join("")).item).toMatchObject({ skipped: expect.stringContaining("running") })
  })
})
