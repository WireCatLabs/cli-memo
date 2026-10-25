import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { configPath, loadConfig, updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { updateNotice } from "../update.js"

let env: NodeJS.ProcessEnv
let dir: string

const memo = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

const doctor = (...args: string[]) => memo("doctor", ...args)

const writeConfig = (text: string) => {
  mkdirSync(join(dir, "config"), { recursive: true })
  writeFileSync(configPath(env), text)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "doctor-"))
  env = {
    ...process.env,
    HOME: dir,
    XDG_CONFIG_HOME: join(dir, "xdg"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
    MESSAGING_STORE: join(dir, "messages.db"),
    WIRECAT_STATE_DIR: join(dir, "wirecat"),
    MEMO_HIMALAYA: join(dir, "no-himalaya"),
  }
  // cli-base's notice stays silent under CI and the opt-out variables; the release check runs with CI set.
  for (const name of ["CI", "NO_UPDATE_NOTIFIER", "MEMO_NO_UPDATE_CHECK"]) delete env[name]
})

afterEach(() => {
  process.exitCode = 0
})

describe("memo doctor", () => {
  it("says where memo keeps its files and that nothing needs attention on a fresh setup", async () => {
    mkdirSync(join(dir, "wirecat"), { recursive: true })
    writeFileSync(join(dir, "messages.db"), "")
    const report = JSON.parse(await doctor("--json"))

    expect(report.item).toMatchObject({
      config: { path: join(dir, "config", "config.json"), found: false, issues: [] },
      store: { path: join(dir, "messages.db") },
      search_model: { name: "e5-small", present: false },
      timer: { enabled: false, failing: null },
      mail: { accounts: [], himalaya: null },
    })
    expect(report.meta.run_id).toEqual(expect.any(String))
  })

  it("names each problem with the command that fixes it, and exits 1", async () => {
    updateConfig(
      () => ({
        notes: { folders: [join(dir, "gone")] },
        mail: { accounts: [{ name: "home", address: "alice@example.test" }] },
        auto: { enabled: true, every: "5m" },
      }),
      env,
    )

    const text = await doctor()

    expect(text).toContain(
      `! the notes folder ${join(dir, "gone")} is missing — connect its disk; if it moved, memo folders update <id> <new path>`,
    )
    expect(text).toContain("! himalaya is not on PATH, so mail cannot be read")
    expect(text).toContain("! the timer is on in the config but not installed — memo jobs start")
    expect(process.exitCode).toBe(1)
  })
})

describe("memo doctor on a config file with problems", () => {
  it("says where the JSON stops parsing, and still answers with exit 0", async () => {
    writeConfig('{\n  "update_check": false,\n  "notes": \n}\n')

    const report = JSON.parse(await doctor("--json"))

    expect(report.error).toBeUndefined()
    expect(report.item.config).toEqual({
      path: configPath(env),
      found: true,
      issues: [
        {
          kind: "invalid_json",
          file: configPath(env),
          line: 4,
          column: 1,
          what: "the file is not valid JSON at line 4, column 1",
        },
      ],
    })
    expect(process.exitCode ?? 0).toBe(0)
  })

  it("lists every problem with a fix that runs as written, and nothing once the fixes ran", async () => {
    writeConfig(
      JSON.stringify({
        update_check: "sometimes-secret",
        default_profile: "work",
        mail: { accounts: [{ name: "home", address: "a@example.test", colour: "blue" }] },
        permissions: { "auto.start": "deny", "notes.edit": "deny" },
      }),
    )

    const { issues } = JSON.parse(await doctor("--json")).item.config

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          kind: "invalid_value",
          file: configPath(env),
          key: "update_check",
          what: "setting update_check has to be of type boolean",
          fix: "memo config unset update_check",
        },
        {
          kind: "unknown_setting",
          file: configPath(env),
          key: "default_profile",
          what: "setting default_profile is not a setting of memo",
          fix: "memo config unset default_profile",
        },
        {
          kind: "unknown_setting",
          file: configPath(env),
          key: "mail.accounts.0.colour",
          what: "setting mail.accounts.0.colour is not a setting of memo",
          fix: "memo config unset mail.accounts.0.colour",
        },
        {
          kind: "unknown_permission",
          file: configPath(env),
          key: "permissions.auto.start",
          what: "permissions.auto.start names no command",
          fix: "memo config unset permissions.auto.start",
        },
      ]),
    )
    expect(issues).toHaveLength(4)
    expect(JSON.stringify(issues)).not.toContain("sometimes-secret")
    expect(() => loadConfig(env)).toThrow(
      "remove it with `memo config unset update_check` (and 2 more problems — `memo doctor` lists them all)",
    )

    for (const { fix } of issues) await memo(...fix.split(" ").slice(1))

    expect(JSON.parse(await doctor("--json")).item.config.issues).toEqual([])
    expect(JSON.parse(readFileSync(configPath(env), "utf8"))).toEqual({
      mail: { accounts: [{ name: "home", address: "a@example.test" }] },
      permissions: { "notes.edit": "deny" },
    })
    expect(JSON.parse(await memo("config", "unset", "default_profile", "--json")).item).toMatchObject({
      key: "default_profile",
      removed: false,
    })
  })
})

describe("the update notice", () => {
  const environment = {
    fetch: async () => new Response(JSON.stringify({ version: "99.0.0" })),
    stderrIsTTY: true,
    scriptPath: "/usr/lib/node_modules/@wirecat/cli-memo/dist/bin/memo.js",
    now: () => 1_800_000_000_000,
  }

  it("says a newer memo exists and how to get it, asking npm once a day", async () => {
    let asked = 0
    const counting = {
      ...environment,
      fetch: async () => {
        asked++
        return environment.fetch()
      },
    }

    const line = await updateNotice(["search", "budget"], { tty: true, env, environment: counting })
    await updateNotice(["search", "budget"], { tty: true, env, environment: counting })

    expect(line).toMatch(/99\.0\.0/)
    expect(line).toContain("memo upgrade")
    expect(asked).toBe(1)
  })

  it("stays silent for JSON, a stdout that is not a terminal, the timer's own run, and when turned off", async () => {
    expect(await updateNotice(["search", "budget", "--json"], { tty: true, env, environment })).toBeUndefined()
    expect(await updateNotice(["search", "budget", "--json=ref"], { tty: true, env, environment })).toBeUndefined()
    expect(await updateNotice(["search", "budget"], { tty: false, env, environment })).toBeUndefined()
    expect(await updateNotice(["sync"], { tty: true, env: { ...env, MEMO_AUTO: "1" }, environment })).toBeUndefined()
    updateConfig(() => ({ update_check: false }), env)
    expect(await updateNotice(["search", "budget"], { tty: true, env, environment })).toBeUndefined()
  })
})
