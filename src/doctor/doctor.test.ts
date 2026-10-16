import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { updateNotice } from "../update.js"

let env: NodeJS.ProcessEnv
let dir: string

const doctor = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync(["doctor", ...args], { from: "user" })
  return streams.stdout.join("")
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
      config: { path: join(dir, "config", "config.json"), exists: false },
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

    expect(text).toContain(`! the notes folder ${join(dir, "gone")} is missing — memo folders`)
    expect(text).toContain("! himalaya is not on PATH, so mail cannot be read")
    expect(text).toContain("! the timer is on in the config but not installed — memo auto start")
    expect(process.exitCode).toBe(1)
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
