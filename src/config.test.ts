import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { configPath, loadConfig, updateConfig } from "./config.js"

const setup = (config: unknown) => {
  const root = mkdtempSync(join(tmpdir(), "memo-config-"))
  const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, "config") }
  mkdirSync(dirname(configPath(env)), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify(config))
  return env
}

const saved = (env: NodeJS.ProcessEnv) => JSON.parse(readFileSync(configPath(env), "utf8"))

describe("config setting names", () => {
  it("reads the camelCase mail limits and saves the file in snake_case", () => {
    const env = setup({ mail: { accounts: [], maxBodyChars: 10, maxAttachmentChars: 20 } })
    expect(loadConfig(env).mail).toMatchObject({ max_body_chars: 10, max_attachment_chars: 20 })
    expect(saved(env).mail).toEqual({ accounts: [], max_body_chars: 10, max_attachment_chars: 20 })
  })

  it("rejects both spellings of one setting with different values", () => {
    const env = setup({ mail: { accounts: [], maxBodyChars: 10, max_body_chars: 11 } })
    expect(() => loadConfig(env)).toThrow()
  })

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

  // Skipped until cli-core carries PR #1224: the installed one does not rename keys inside arrays.
  it.skip("reads camelCase listId and decidedAt inside rules and saves them in snake_case", () => {
    const rule = { match: { listId: "x.example" }, action: "skip", decidedAt: "2026-10-14" }
    const env = setup({ mail: { accounts: [{ name: "a", address: "a@example.test", rules: [rule] }] } })
    expect(loadConfig(env).mail?.accounts[0]?.rules).toEqual([
      { match: { list_id: "x.example" }, action: "skip", decided_at: "2026-10-14" },
    ])
    expect(saved(env).mail.accounts[0].rules[0]).toHaveProperty("decided_at")
  })
})
