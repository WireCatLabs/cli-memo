import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
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

const refused = (text: string) => ({
  code: "validation_error",
  message: expect.stringContaining(text),
})

it("points tasks list --project to the project: query word", async () => {
  const { run } = await setUp()

  await expect(run("tasks", "list", "--project", "SYNT", "--json")).rejects.toMatchObject(
    refused("memo tasks list project:SYNT"),
  )
})
