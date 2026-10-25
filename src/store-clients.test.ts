import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"
import { VERSION } from "./version.js"

it("records memo and its version in the store's clients after a command", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "memo-clients-")), "store.db")
  const env = { ...process.env, AI_AGENT: "", CLAUDECODE: "", MESSAGING_STORE: path }
  await createProgram({ streams: captureStreams(), env })
    .exitOverride()
    .parseAsync(["projects", "list", "--json"], { from: "user" })

  const database = new DatabaseSync(path, { readOnly: true })
  const row = database.prepare("SELECT value FROM store_settings WHERE key = 'clients'").get()
  database.close()
  const clients = JSON.parse(String(row?.value)) as { command: string; version: string }[]
  expect(clients).toMatchObject([{ command: "memo", version: VERSION }])
})
