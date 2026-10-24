import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"

it("previews Gmail filters under the canonical import path and applies them only with yes", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-filter-import-"))
  const env = { ...process.env, MEMO_CONFIG_DIR: root, MESSAGING_STORE: join(root, "store.db") }
  updateConfig((config) => ({ ...config, mail: { accounts: [{ name: "work", address: "work@example.test" }] } }), env)
  const file = join(root, "Filters.json")
  writeFileSync(
    file,
    JSON.stringify([{ criteria: { from: "news@example.test" }, action: { removeLabelIds: ["INBOX"] } }]),
  )
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ env, streams })
      .exitOverride()
      .parseAsync(["mail", "rules", ...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  expect(await run("import", "work", file, "--format", "gmail")).toMatchObject({ added: 0 })
  expect((await run("list", "work")).items).toEqual([])
  expect(await run("import", "work", file, "--format", "gmail", "--yes")).toMatchObject({ added: 1 })
  expect((await run("list", "work")).items).toMatchObject([
    { match: { from: "news@example.test" }, action: "envelope" },
  ])
})
