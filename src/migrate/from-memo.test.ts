import * as fs from "node:fs"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { join } from "node:path"
import { type KeyringStore, memoryKeyring } from "@wirecat/cli-base"
import type { Ran, ServerSystem } from "@wirecat/cli-core/background"
import type { Schedule } from "@wirecat/cli-core/cli"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mayMigrate } from "./check.js"
import { MARKER, migrateFromMemo, renamedPrompt, renamedSchedule } from "./from-memo.js"

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})

afterEach(() => {
  vi.mocked(fs.renameSync).mockClear()
})

const SECRET = "sk-synthetic-0000"

/** A home of its own with memo's three folders in it, and a fake systemctl and machine that only log. */
const setUp = () => {
  const home = mkdtempSync(join(tmpdir(), "wcat-from-memo-"))
  if (!process.env.WCAT_SYSTEMCTL) throw new Error("test/sandbox.ts sets the fake systemctl")
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    PATH: process.env.PATH,
    WCAT_SYSTEMCTL: process.env.WCAT_SYSTEMCTL,
    WCAT_SYSTEMCTL_LOG: join(home, "systemctl.log"),
  }
  const old = {
    config: join(home, ".config", "cli-memo"),
    state: join(home, ".local", "share", "cli-memo"),
    cache: join(home, ".cache", "cli-memo"),
  }
  const now = {
    config: join(home, ".config", "wcat"),
    state: join(home, ".local", "share", "wcat"),
    cache: join(home, ".cache", "wcat"),
  }
  for (const [kind, folder] of Object.entries(old)) {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, `${kind}.txt`), kind)
  }
  const ran: string[][] = []
  const system: ServerSystem = {
    platform: "linux",
    uid: 501,
    entry: [process.execPath, "/opt/wcat-wirecat.js"],
    spawn: () => 0,
    pause: async () => {},
    run: async (argv): Promise<Ran> => {
      ran.push(argv)
      return { code: 0, stdout: "", stderr: "" }
    },
  }
  const keyring = memoryKeyring()
  const warnings: string[] = []
  const migrate = (more: { keyring?: KeyringStore; env?: NodeJS.ProcessEnv } = {}) =>
    migrateFromMemo({
      env: more.env ?? env,
      platform: "linux",
      home,
      keyring: more.keyring ?? keyring,
      system,
      warn: (line) => warnings.push(line),
    })
  const units = join(home, ".config", "systemd", "user")
  const marker = () => JSON.parse(readFileSync(join(now.state, MARKER), "utf8"))
  return { home, env, old, now, ran, keyring, warnings, migrate, units, marker }
}

describe("wcat's first start after memo", () => {
  it("moves memo's folders and keyring entries once, and leaves a marker", async () => {
    const f = setUp()
    writeFileSync(
      join(f.old.config, "config.json"),
      JSON.stringify({ embeddings: { base_url: "https://ai.example.test/v1" } }),
    )
    f.keyring.set("cli-memo", "embeddings:openai", SECRET)
    f.keyring.set("cli-memo", "embeddings:ai.example.test", "synthetic-endpoint-key")
    mkdirSync(join(f.old.state, "mcp-http"))
    writeFileSync(join(f.old.state, "mcp-http", "memo.json"), "{}")
    const oldTasks = join(f.home, ".config", "cli-memo-tasks")
    mkdirSync(oldTasks)
    writeFileSync(join(oldTasks, "config.json"), "{}")

    expect(await f.migrate()).toBe("migrated")

    expect(existsSync(join(f.now.state, "mcp-http", "wcat.json"))).toBe(true)
    expect(existsSync(join(f.home, ".config", "wcat-tasks", "config.json"))).toBe(true)
    expect(existsSync(oldTasks)).toBe(false)

    for (const kind of ["config", "state", "cache"] as const) {
      expect(readFileSync(join(f.now[kind], `${kind}.txt`), "utf8")).toBe(kind)
      expect(existsSync(f.old[kind])).toBe(false)
    }
    expect(f.keyring.get("wcat", "embeddings:openai")).toBe(SECRET)
    expect(f.keyring.get("wcat", "embeddings:ai.example.test")).toBe("synthetic-endpoint-key")
    expect(f.keyring.get("cli-memo", "embeddings:openai")).toBeNull()
    expect(f.keyring.get("cli-memo", "embeddings:ai.example.test")).toBeNull()
    expect(f.marker()).toMatchObject({ keyring: "done" })
    expect(f.warnings).toEqual([])

    expect(await f.migrate()).toBe("done-before")
  })

  it("moves nothing in a run with moved folders", async () => {
    const f = setUp()
    f.keyring.set("cli-memo", "embeddings:openai", SECRET)
    const moved = { ...f.env, WCAT_STATE_DIR: join(f.home, "elsewhere") }

    expect(await f.migrate({ env: moved })).toBe("moved-run")
    expect(mayMigrate(moved, "linux")).toBe(false)
    expect(existsSync(f.old.state)).toBe(true)
    expect(f.keyring.get("cli-memo", "embeddings:openai")).toBe(SECRET)
  })

  it("never merges: a folder wcat already holds files in stays, and memo's beside it", async () => {
    const f = setUp()
    mkdirSync(f.now.config, { recursive: true })
    writeFileSync(join(f.now.config, "config.json"), "{}")

    expect(await f.migrate()).toBe("migrated")

    expect(readFileSync(join(f.old.config, "config.txt"), "utf8")).toBe("config")
    expect(existsSync(join(f.now.config, "config.txt"))).toBe(false)
    expect(existsSync(join(f.now.state, "state.txt"))).toBe(true)
    expect(f.warnings).toEqual([expect.stringContaining("memo's config folder stayed where it was")])
  })

  it("copies and then removes a folder on another file system", async () => {
    const f = setUp()
    const exdev = Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" })
    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      throw exdev
    })

    expect(await f.migrate()).toBe("migrated")

    expect(readFileSync(join(f.now.config, "config.txt"), "utf8")).toBe("config")
    expect(existsSync(f.old.config)).toBe(false)
    expect(existsSync(`${f.now.config}.moving`)).toBe(false)
  })

  it("keeps memo's keyring entry when the copy fails, and moves it on the next start", async () => {
    const f = setUp()
    f.keyring.set("cli-memo", "registries:cas", SECRET)
    let refuse = true
    const flaky: KeyringStore = {
      get: (service, account) => f.keyring.get(service, account),
      delete: (service, account) => f.keyring.delete(service, account),
      set: (service, account, secret) => {
        if (refuse) throw new Error("synthetic keyring refusal")
        f.keyring.set(service, account, secret)
      },
    }

    expect(await f.migrate({ keyring: flaky })).toBe("migrated")
    expect(f.marker()).toMatchObject({ keyring: "retry" })
    expect(f.keyring.get("cli-memo", "registries:cas")).toBe(SECRET)

    refuse = false
    expect(await f.migrate({ keyring: flaky })).toBe("keyring-retried")
    expect(f.keyring.get("wcat", "registries:cas")).toBe(SECRET)
    expect(f.keyring.get("cli-memo", "registries:cas")).toBeNull()
    expect(f.marker()).toMatchObject({ keyring: "done" })
    expect(await f.migrate({ keyring: flaky })).toBe("done-before")
  })

  it("keeps both keys when wcat already holds a different one", async () => {
    const f = setUp()
    f.keyring.set("cli-memo", "embeddings:anthropic", "old-synthetic")
    f.keyring.set("wcat", "embeddings:anthropic", "new-synthetic")

    await f.migrate()

    expect(f.keyring.get("wcat", "embeddings:anthropic")).toBe("new-synthetic")
    expect(f.keyring.get("cli-memo", "embeddings:anthropic")).toBe("old-synthetic")
  })

  it("puts memo's schedules on wcat's timers, in wcat's words", async () => {
    const f = setUp()
    const folder = join(f.old.state, "schedules", "triage")
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, "schedule.json"),
      JSON.stringify({
        name: "triage",
        kind: "command",
        argv: ["mail", "review", "--new"],
        when: { daily: "08:30" },
        environment: { MEMO_PROFILE: "" },
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    )

    expect(await f.migrate()).toBe("migrated")

    const moved = JSON.parse(readFileSync(join(f.now.state, "schedules", "triage", "schedule.json"), "utf8"))
    expect(moved).toMatchObject({ argv: ["review", "mail", "--new"], environment: { WCAT_PROFILE: "" } })
    expect(moved.paused).toBeUndefined()
    expect(existsSync(join(f.units, "wcat-schedule-triage.timer"))).toBe(true)
    expect(existsSync(join(f.units, "memo-schedule-triage.timer"))).toBe(false)
    expect(existsSync(join(f.now.state, "migrating-schedules.json"))).toBe(false)
  })

  it("replaces memo's sync timer with wcat's, keeping the PATH it was set up with", async () => {
    const f = setUp()
    writeFileSync(
      join(f.old.config, "config.json"),
      JSON.stringify({ auto: { enabled: true, every: "10m", places: { MEMO_PROFILE: "work" } } }),
    )
    mkdirSync(f.units, { recursive: true })
    writeFileSync(
      join(f.units, "memo-import.service"),
      '[Service]\nEnvironment="PATH=/synthetic/bin"\nExecStart="/gone/node" "/gone/memo.js" "sync"\n',
    )
    writeFileSync(join(f.units, "memo-import.timer"), "[Timer]\nOnUnitInactiveSec=10min\n")

    expect(await f.migrate()).toBe("migrated")

    expect(existsSync(join(f.units, "memo-import.service"))).toBe(false)
    expect(existsSync(join(f.units, "memo-import.timer"))).toBe(false)
    const service = readFileSync(join(f.units, "wcat-import.service"), "utf8")
    expect(service).toContain("/synthetic/bin")
    expect(service).toContain("WCAT_PROFILE=work")
    expect(service).not.toContain("MEMO_")
    expect(readFileSync(join(f.units, "wcat-import.timer"), "utf8")).toContain("OnUnitInactiveSec=10min")
    expect(f.warnings).toEqual([])
    const calls = readFileSync(join(f.home, "systemctl.log"), "utf8")
    expect(calls).toContain("disable --now memo-import.timer")
    expect(calls).toContain("enable --now wcat-import.timer")
  })

  it("installs wcat's skill where memo's was, and leaves a hand-written one", async () => {
    const f = setUp()
    const stamped = join(f.home, ".claude", "skills", "cli-memo")
    mkdirSync(stamped, { recursive: true })
    writeFileSync(join(stamped, "SKILL.md"), "---\nname: cli-memo\nmetadata:\n  version: 0.99.0\n---\nold\n")
    const handWritten = join(f.home, ".agents", "skills", "cli-memo")
    mkdirSync(handWritten, { recursive: true })
    writeFileSync(join(handWritten, "SKILL.md"), "---\nname: cli-memo\n---\nmine\n")

    await f.migrate()

    expect(existsSync(stamped)).toBe(false)
    expect(readFileSync(join(f.home, ".claude", "skills", "wcat", "SKILL.md"), "utf8")).toMatch(/^name: wcat$/m)
    expect(readFileSync(join(handWritten, "SKILL.md"), "utf8")).toContain("mine")
    expect(existsSync(join(f.home, ".agents", "skills", "wcat"))).toBe(false)
  })
})

it("asks an agent in wcat's words what it asked in memo's", () => {
  expect(
    renamedPrompt("Run memo skill show mail-triage, then memo mail review --new and memo mail findings add -"),
  ).toBe("Run wcat skill show mail-triage, then wcat review mail --new and wcat review findings add -")
  expect(renamedPrompt("a memo to self")).toBe("a memo to self")
})

it("moves nothing from a checkout's bin, as cli-dev lint and the smoke run it with the developer's own home", () => {
  const env = { HOME: userInfo().homedir, XDG_DATA_HOME: mkdtempSync(join(tmpdir(), "wcat-may-migrate-")) }
  expect(mayMigrate(env, "linux", "/home/dev/Projects/wirecat/dist/bin/wcat-wirecat.js")).toBe(false)
  expect(mayMigrate(env, "linux", "/usr/lib/node_modules/@wirecat/wirecat/dist/bin/wcat-wirecat.js")).toBe(true)
  expect(mayMigrate(env, "win32", "C:\\npm\\node_modules\\@wirecat\\wirecat\\dist\\bin\\wcat-wirecat.js")).toBe(true)
})

it("lets an agent schedule's agent run wcat, as its prompt now asks", () => {
  const agent = {
    name: "triage",
    kind: "agent",
    argv: ["claude", "-p", "Run memo skill show mail-triage", "--allowedTools", "Bash(memo:*)"],
    environment: {},
    when: { daily: "08:30" },
    createdAt: "2026-11-01T00:00:00.000Z",
  } as unknown as Schedule
  expect(renamedSchedule(agent).argv).toEqual([
    "claude",
    "-p",
    "Run wcat skill show mail-triage",
    "--allowedTools",
    "Bash(wcat:*)",
  ])
})
