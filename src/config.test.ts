import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { configPath, updateConfig } from "./config.js"

const setup = (config: unknown) => {
  const root = mkdtempSync(join(tmpdir(), "memo-config-"))
  const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, "config") }
  mkdirSync(dirname(configPath(env)), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify(config))
  return env
}

const saved = (env: NodeJS.ProcessEnv) => JSON.parse(readFileSync(configPath(env), "utf8"))

describe("config setting names", () => {
  it("writes rules in snake_case", () => {
    const env = setup({ mail: { accounts: [{ name: "a", address: "a@example.test" }] } })
    updateConfig(
      (config) => ({
        ...config,
        mail: {
          accounts: [
            {
              name: "a",
              address: "a@example.test",
              rules: [{ match: { list_id: "x.example" }, action: "skip", decided_at: "2026-10-14" }],
            },
          ],
        },
      }),
      env,
    )
    expect(saved(env).mail.accounts[0].rules[0]).toEqual({
      match: { list_id: "x.example" },
      action: "skip",
      decided_at: "2026-10-14",
    })
  })
})
