import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

const KEY = "report/morning-digest"

const fixture = (extra: NodeJS.ProcessEnv = {}) => {
  const root = mkdtempSync(join(tmpdir(), "memo-templates-"))
  const streams = captureStreams()
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db"), MEMO_STATE_DIR: join(root, "state"), ...extra }
  const run = (...args: string[]) =>
    createProgram({ streams, env })
      .exitOverride()
      .parseAsync(["templates", ...args], { from: "user" })
  const file = join(root, "digest.liquid")
  writeFileSync(file, "МОЙ {{ summary }}")
  return { run, streams, file }
}

it("saves the owner's template and shows it, as JSON", async () => {
  const { run, streams, file } = fixture()

  await run("edit", KEY, "--channel", "text", "--language", "ru", "--file", file, "--json")
  await run("show", KEY, "--channel", "text", "--language", "ru", "--json")

  const shown = JSON.parse(streams.stdout.at(-1) ?? "{}")
  expect(shown.item).toMatchObject({ key: KEY, channel: "text", source: "stored", body: "МОЙ {{ summary }}" })
})

it("refuses a template change under MEMO_READ_ONLY, and still shows and previews", async () => {
  const { run, file } = fixture({ MEMO_READ_ONLY: "1" })

  await expect(run("edit", KEY, "--channel", "text", "--language", "ru", "--file", file)).rejects.toMatchObject({
    code: "permission_error",
    message: expect.stringContaining("MEMO_READ_ONLY"),
  })
  await expect(run("reset", KEY, "--channel", "text", "--language", "ru")).rejects.toMatchObject({
    code: "permission_error",
  })
  await run("preview", KEY, "--channel", "telegram", "--language", "ru", "--json")
})
