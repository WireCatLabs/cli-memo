import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { throwParseFailures } from "../failure.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "wcat-notes-only-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    WCAT_CONFIG_DIR: join(root, "config"),
    WCAT_STATE_DIR: join(root, "state"),
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
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
