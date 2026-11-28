import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
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

const FAKE_FILES = join(import.meta.dirname, "..", "..", "test", "fake-files")

/** `wcat-files` on PATH, answering `sync --json` with these folders and failures. */
const withFiles = (item: { notes?: unknown[]; failed?: unknown[] }) => {
  env = {
    ...env,
    PATH: `${FAKE_FILES}${delimiter}${env.PATH ?? ""}`,
    WCAT_FAKE_FILES: JSON.stringify({ notes: [], failed: [], ...item }),
    WCAT_FAKE_FILES_LOG: join(dir, "files.log"),
  }
}

const unbound = (path: string) => ({
  source: `notes ${path}`,
  code: "configuration_error",
  reasonId: "folder.unbound",
  reason: `${path} has no folder id — files folders add ${path}`,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auto-"))
  env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, "xdg"),
    WCAT_CONFIG_DIR: join(dir, "config"),
    WCAT_STATE_DIR: join(dir, "state"),
    MESSAGING_STORE: join(dir, "messages.db"),
    WCAT_SYSTEMCTL_LOG: join(dir, "systemctl.log"),
  }
})

describe("wcat auto", () => {
  it("installs a timer with the interval asked for, and remembers it in the config", async () => {
    await run("jobs", "start", "--every", "2m")

    expect(readFileSync(join(units(), "wcat-import.timer"), "utf8")).toContain("OnUnitInactiveSec=2min")
    expect(readFileSync(join(units(), "wcat-import.service"), "utf8")).toMatch(
      /ExecStart=".*" ".*wcat-wirecat\.js" "sync"/,
    )
    expect(calls()).toContain("--user enable --now wcat-import.timer")
    expect(loadConfig(env).auto).toMatchObject({ enabled: true, every: "2m" })
  })

  it("leaves a timer that already matches the config alone", async () => {
    await run("jobs", "start")
    writeFileSync(join(dir, "systemctl.log"), "")

    await run("jobs", "start")

    expect(calls()).toBe("")
  })

  it("refuses an interval under a minute", async () => {
    await expect(run("jobs", "start", "--every", "30s")).rejects.toThrow()
  })

  it("removes the timer when turned off", async () => {
    await run("jobs", "start")

    await run("jobs", "stop")

    expect(existsSync(join(units(), "wcat-import.timer"))).toBe(false)
    expect(calls()).toContain("--user disable --now wcat-import.timer")
    expect(loadConfig(env).auto?.enabled).toBe(false)
  })

  it("follows a hand edit of the config at the next timer run", async () => {
    await run("jobs", "start", "--every", "5m")
    updateConfig((config) => ({ ...config, auto: { enabled: true, every: "15m" } }), env)

    await run("sync")
    expect(readFileSync(join(units(), "wcat-import.timer"), "utf8")).toContain("OnUnitInactiveSec=5min")

    env = { ...env, WCAT_AUTO: "1" }
    await run("sync")
    expect(readFileSync(join(units(), "wcat-import.timer"), "utf8")).toContain("OnUnitInactiveSec=15min")

    updateConfig((config) => ({ ...config, auto: { enabled: false } }), env)
    expect(await run("sync")).toBe("")
    expect(existsSync(join(units(), "wcat-import.timer"))).toBe(false)
  })

  it("passes the folders and store wcat was started with to every timer run", async () => {
    await run("jobs", "start")

    const unit = readFileSync(join(units(), "wcat-import.service"), "utf8")
    expect(unit).toContain(`"MESSAGING_STORE=${join(dir, "messages.db")}"`)
    expect(unit).toContain(`"WCAT_CONFIG_DIR=${join(dir, "config")}"`)
    expect(loadConfig(env).auto?.places).toMatchObject({ WCAT_STATE_DIR: join(dir, "state") })
  })

  it("points the timer at the installed wcat that ran last, and never at a checkout", async () => {
    await run("jobs", "start")
    const service = join(units(), "wcat-import.service")
    writeFileSync(
      service,
      readFileSync(service, "utf8").replace(/ExecStart=.*/, 'ExecStart="/gone/node" "/gone/memo.js" "sync"'),
    )

    await followInstall(env, "/home/someone/project/cli-memo/dist/bin/wcat-wirecat.js")
    expect(readFileSync(service, "utf8")).toContain("/gone/node")

    await followInstall({ ...env, WCAT_AUTO: "1" }, "/usr/lib/node_modules/@wirecat/wirecat/dist/bin/wcat-wirecat.js")
    expect(readFileSync(service, "utf8")).toContain("/gone/node")

    await followInstall(env, "/usr/lib/node_modules/@wirecat/wirecat/dist/bin/wcat-wirecat.js")
    expect(readFileSync(service, "utf8")).toContain(process.execPath)
  })

  it("never points the timer at another tool's private install of wcat", async () => {
    await run("jobs", "start")
    const service = join(units(), "wcat-import.service")
    writeFileSync(
      service,
      readFileSync(service, "utf8").replace(/ExecStart=.*/, 'ExecStart="/kept/node" "/kept/memo.js" "sync"'),
    )
    const roots = ["/home/someone/.nvm/versions/node/v24.0.0/lib/node_modules"]

    await followInstall(
      env,
      "/home/someone/docs-tool/.tooling/memo-v1/node_modules/@wirecat/wirecat/dist/bin/wcat-wirecat.js",
      roots,
    )
    expect(readFileSync(service, "utf8")).toContain("/kept/node")

    await followInstall(env, `${roots[0]}/@wirecat/wirecat/dist/bin/wcat-wirecat.js`, roots)
    expect(readFileSync(service, "utf8")).toContain(process.execPath)
  })

  it("never starts, enables or rewrites the PATH of a timer stopped by hand when an install moves", async () => {
    await run("jobs", "start")
    const service = join(units(), "wcat-import.service")
    writeFileSync(
      service,
      readFileSync(service, "utf8")
        .replace(/ExecStart=.*/, 'ExecStart="/gone/node" "/gone/memo.js" "sync"')
        .replace(/PATH=[^"]*/, "PATH=/the/shell/path"),
    )
    writeFileSync(join(dir, "systemctl.log"), "")

    await followInstall(
      { ...env, PATH: `/the/app/path:${env.PATH}` },
      "/usr/lib/node_modules/@wirecat/wirecat/dist/bin/wcat-wirecat.js",
    )

    const unit = readFileSync(service, "utf8")
    expect(unit).toContain(process.execPath)
    expect(unit).toContain("PATH=/the/shell/path")
    expect(calls()).toBe("--user daemon-reload\n")
  })

  it("leaves the timer alone on a read when the install did not move", async () => {
    await run("jobs", "start")
    writeFileSync(join(dir, "systemctl.log"), "")

    await followInstall(
      { ...env, PATH: `/the/app/path:${env.PATH}` },
      "/usr/lib/node_modules/@wirecat/wirecat/dist/bin/wcat-wirecat.js",
    )
    await run("jobs", "status", "--json")

    expect(calls()).not.toMatch(/daemon-reload|enable|start|restart/)
  })

  it("shows whether the timer is on and when it runs next", async () => {
    await run("jobs", "start")

    const status = answerOf(await run("jobs", "status", "--json"))

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
  it("is said on every command until a timer run passes, and wcat jobs status shows the streak", async () => {
    updateConfig((config) => ({ ...config, auto: { enabled: true, every: "5m" } }), env)
    withFiles({ failed: [unbound(join(dir, "vault"))] })
    const timerSync = () =>
      createProgram({ streams: captureStreams(), env: { ...env, WCAT_AUTO: "1" } })
        .exitOverride()
        .parseAsync(["sync"], { from: "user" })

    await timerSync()
    await timerSync()
    process.exitCode = 0

    expect(autoNotice({ ...env, WCAT_AUTO: "1" })).toBeUndefined()
    expect(autoNotice(env)).toMatch(
      /^wcat: scheduled sync failing since .* \(2 runs\): notes: configuration_error \(folder\.unbound\) — wcat jobs status$/,
    )
    expect(answerOf(await run("jobs", "status", "--json")).failing).toMatchObject({
      runs: 2,
      reason: "notes: configuration_error (folder.unbound)",
      log: "journalctl --user -u wcat-import.service",
    })

    withFiles({})
    await timerSync()

    expect(autoNotice(env)).toBeUndefined()
    expect(answerOf(await run("jobs", "status", "--json")).failing).toBeNull()
  })

  it("keeps a failing source's reason id, not the title its error names, out of last.json and jobs status", async () => {
    const titled = join(dir, "Synthetic Chat Title")
    const streams = captureStreams()
    updateConfig(() => ({ auto: { enabled: true, every: "5m" } }), env)
    withFiles({ failed: [unbound(titled)] })

    await createProgram({ streams, env: { ...env, WCAT_AUTO: "1" } })
      .exitOverride()
      .parseAsync(["sync"], { from: "user" })
    process.exitCode = 0

    expect(streams.stdout.join("")).toContain("Synthetic Chat Title")
    const last = readFileSync(join(dir, "state", "auto", "last.json"), "utf8")
    const kept = [last, await run("jobs", "status"), await run("jobs", "status", "--json"), autoNotice(env)]
    for (const text of kept) {
      expect(text).toContain("notes: configuration_error (folder.unbound)")
      expect(text).not.toContain("Synthetic")
    }
  })

  it("is not recorded for a sync started by hand", async () => {
    await run("sync")
    process.exitCode = 0

    expect(autoNotice(env)).toBeUndefined()
  })
})

describe("wcat sync", () => {
  it("runs files sync when wcat-files is on PATH, and reports its folders and failures as its own", async () => {
    withFiles({
      notes: [{ folder: join(dir, "vault"), folderId: "1", notes: 1, changed: 1, renamed: 0, deleted: 0 }],
      failed: [unbound(join(dir, "other"))],
    })
    const text = await run("sync")
    process.exitCode = 0
    expect(text).toMatch(/notes .*vault: 1 notes, 1 changed, 0 moved, 0 gone/)
    expect(text).toMatch(/failed notes .*other: .*has no folder id — files folders add/)
    expect(readFileSync(join(dir, "files.log"), "utf8")).toBe("sync --json\n")
    await run("sync", "--no-embed", "--only", "notes")
    expect(readFileSync(join(dir, "files.log"), "utf8")).toBe("sync --json\nsync --json --no-embed\n")
  })

  it("syncs mail and people without the files CLI, and names it when --only notes asks for it", async () => {
    expect(answerOf(await run("sync", "--json"))).toMatchObject({ notes: [], failed: [] })
    await expect(run("sync", "--only", "notes")).resolves.toMatch(/failed notes: .*files CLI, which is not installed/)
    process.exitCode = 0
  })

  it("lists wcat sync, and a bare wcat import from an old timer is refused without syncing", async () => {
    const commands = await run("commands", "--json")
    expect(commands).toContain('"path":["sync"]')
    await expect(run("import")).rejects.toThrow()
    expect(existsSync(join(dir, "state", "import.lock"))).toBe(false)
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
    env = { ...env, WCAT_AUTO: "1" }
    process.exitCode = undefined
    const streams = captureStreams()

    await createProgram({ streams, env }).exitOverride().parseAsync(["sync", "--json"], { from: "user" })

    expect(process.exitCode).toBeUndefined()
    expect(streams.stderr.join("")).toBe(`wcat sync skipped: another wcat sync is running (process ${process.ppid})`)
    expect(answerOf(streams.stdout.join(""))).toMatchObject({ skipped: expect.stringContaining("running") })
  })
})
