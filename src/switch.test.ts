import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { updateConfig } from "./config.js"
import { SWITCH_NOTICE_FROM, switchCommands, switchNotice, upgradeCommand } from "./switch.js"
import { VERSION } from "./version.js"

let env: NodeJS.ProcessEnv

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "memo-switch-"))
  env = { HOME: root, MEMO_CONFIG_DIR: join(root, "config"), MEMO_STATE_DIR: join(root, "state") }
})

afterEach(() => {
  process.exitCode = undefined
})

const npmScript = "/usr/lib/node_modules/@wirecat/cli-memo/dist/bin/memo.js"

const registry =
  (versions: Record<string, string | undefined>) =>
  async (url: string | URL | Request): Promise<Response> => {
    const name = decodeURIComponent(
      String(url)
        .replace("https://registry.npmjs.org/", "")
        .replace(/\/latest$/, ""),
    )
    const version = versions[name]
    return version === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ version }))
  }

const upgrade = async (
  args: string[],
  { versions, codes = {} }: { versions: Record<string, string | undefined>; codes?: Record<string, number> },
) => {
  const ran: string[] = []
  const streams = captureStreams()
  const program = new Command().exitOverride()
  program.addCommand(
    upgradeCommand(streams, {
      env,
      scriptPath: npmScript,
      fetch: registry(versions),
      spawn: (argv) => {
        const line = argv.join(" ")
        ran.push(line)
        return codes[line] ?? 0
      },
    }),
  )
  await program.parseAsync(["upgrade", ...args], { from: "user" })
  return { ran, out: streams.stdout.join(""), err: streams.stderr.join("") }
}

const live = { "@wirecat/cli-memo": VERSION, "@wirecat/wirecat": "1.0.0" }

describe("memo upgrade, the move to wcat", () => {
  it("installs wcat, starts it once, then removes memo", async () => {
    const { ran } = await upgrade(["--json"], { versions: live })

    expect(ran).toEqual([
      "npm install -g @wirecat/wirecat@latest",
      "wcat-wirecat --version",
      "npm rm -g @wirecat/cli-memo",
    ])
  })

  it("also installs the files CLI when notes folders are set", async () => {
    updateConfig(() => ({ notes: { folders: [{ id: "vault", path: "/notes" }] } }), env)

    const { ran, out } = await upgrade(["--json"], { versions: live })

    expect(ran[0]).toBe("npm install -g @wirecat/wirecat@latest @wirecat/files-cli@latest")
    expect(JSON.parse(out).item).toMatchObject({ switched: true, removed: true })
  })

  it("says not yet and runs nothing while wcat is not on npm", async () => {
    const { ran, out } = await upgrade(["--json"], { versions: { "@wirecat/cli-memo": VERSION } })

    expect(ran).toEqual([])
    expect(JSON.parse(out).item).toMatchObject({ wirecat: null, switched: false })
  })

  it("keeps memo when the install fails", async () => {
    await expect(
      upgrade([], { versions: live, codes: { "npm install -g @wirecat/wirecat@latest": 1 } }),
    ).rejects.toMatchObject({ code: "provider_error" })
  })

  it("only looks with --check", async () => {
    const { ran, out } = await upgrade(["--check", "--json"], { versions: live })

    expect(ran).toEqual([])
    expect(JSON.parse(out).item.commands).toEqual([
      "npm install -g @wirecat/wirecat@latest",
      "npm rm -g @wirecat/cli-memo",
    ])
  })

  it("takes a newer memo first, whose own upgrade then moves", async () => {
    const { ran } = await upgrade([], { versions: { ...live, "@wirecat/cli-memo": "999.0.0" } })

    expect(ran).toEqual(["npm install -g @wirecat/cli-memo@latest"])
  })

  it("uses the package manager that installed memo", () => {
    expect(switchCommands("pnpm", ["@wirecat/wirecat"])).toEqual({
      install: ["pnpm", "add", "-g", "@wirecat/wirecat@latest", "--config.minimumReleaseAgeExclude=@wirecat/*"],
      remove: ["pnpm", "remove", "-g", "@wirecat/cli-memo"],
    })
    expect(switchCommands("bun", ["@wirecat/wirecat"])?.remove).toEqual(["bun", "remove", "-g", "@wirecat/cli-memo"])
    expect(switchCommands("npx", ["@wirecat/wirecat"])).toBeUndefined()
  })
})

describe("the daily line that says to move", () => {
  const from = Date.parse(SWITCH_NOTICE_FROM)

  it("starts on the switch day and shows once a day", () => {
    expect(switchNotice(["search", "budget"], { env, now: from - 1, tty: true })).toBeUndefined()
    expect(switchNotice(["search", "budget"], { env, now: from, tty: true })).toContain("memo upgrade")
    expect(switchNotice(["search", "budget"], { env, now: from + 1000, tty: true })).toBeUndefined()
    expect(switchNotice(["search", "budget"], { env, now: from + 25 * 60 * 60 * 1000, tty: true })).toBeDefined()
  })

  it("stays out of JSON, MCP, the timer's run and a pipe", () => {
    const now = Date.parse(SWITCH_NOTICE_FROM)
    expect(switchNotice(["search", "budget", "--json"], { env, now, tty: true })).toBeUndefined()
    expect(switchNotice(["mcp", "serve"], { env, now, tty: true })).toBeUndefined()
    expect(switchNotice(["sync"], { env: { ...env, MEMO_AUTO: "1" }, now, tty: true })).toBeUndefined()
    expect(switchNotice(["search", "budget"], { env, now, tty: false })).toBeUndefined()
  })
})
