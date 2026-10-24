import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { configPath } from "./config.js"
import { createMemoServer } from "./mcp/server.js"
import { createProgram } from "./program.js"

it("refuses moved saved denials and server overrides before serving commands", () => {
  const env = { ...process.env, MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-moved-permissions-")) }
  for (const [previous, next] of [
    ["auto.start", "jobs.start"],
    ["note", "notes.links"],
    ["mail.trash", "mail.delete"],
  ] as const) {
    writeFileSync(configPath(env), JSON.stringify({ permissions: { [String(previous)]: "deny" } }))
    expect(() => createMemoServer(env, createProgram)).toThrow(next)
    writeFileSync(configPath(env), "{}")
    expect(() => createMemoServer(env, createProgram, [`${previous}=deny`])).toThrow(next)
  }
})
