import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { configPath, loadConfig } from "./config.js"

const setup = (config: unknown) => {
  const root = mkdtempSync(join(tmpdir(), "memo-config-"))
  const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, "config") }
  mkdirSync(dirname(configPath(env)), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify(config))
  return env
}

describe("the retired mail settings", () => {
  it("still load from an old config, so memo keeps working until they are removed", () => {
    const env = setup({
      mail: {
        accounts: [{ name: "a", address: "a@example.test", mode: "imap", import: false, rules: [] }],
        max_body_chars: 10,
      },
      notes: { folders: [] },
    })
    expect(loadConfig(env).notes).toEqual({ folders: [] })
  })
})
