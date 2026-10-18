import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { throwParseFailures } from "../failure.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-notes-only-"))
  const vault = join(root, "vault")
  mkdirSync(vault)
  writeFileSync(join(vault, "Plan.md"), "Book the venue for the team day.")
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  await run("folders", "add", vault, "--json")
  await run("sync", "--only", "notes", "--no-embed", "--json")
  return { env, run }
}

it("refuses tasks list --project as an unknown option, before anything is read", async () => {
  const { env } = await setUp()
  const program = createProgram({ streams: captureStreams(), env })
  throwParseFailures(program)

  await expect(program.parseAsync(["tasks", "list", "--project", "SYNT"], { from: "user" })).rejects.toMatchObject({
    code: "commander.unknownOption",
    message: expect.stringContaining("--project"),
  })
})
