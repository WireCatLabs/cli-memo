import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { configPath } from "../config.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

it("refuses a saved or passed permission key that names no command, with no pointer to another", () => {
  const env = { ...process.env, WCAT_CONFIG_DIR: mkdtempSync(join(tmpdir(), "wcat-permissions-")) }
  writeFileSync(configPath(env), JSON.stringify({ permissions: { "auto.start": "deny" } }))
  expect(() => createMemoServer(env, createProgram)).toThrow(
    `${configPath(env)}: permissions.auto.start names no command — remove it with \`wcat config unset permissions.auto.start\``,
  )

  writeFileSync(configPath(env), JSON.stringify({ permissions: { "jobs.start": "deny", "mcp.authority": "deny" } }))
  expect(() => createMemoServer(env, createProgram)).not.toThrow()
  expect(() => createMemoServer(env, createProgram, ["mail.trash=deny"])).toThrow(
    "--permission mail.trash names no command",
  )
})
