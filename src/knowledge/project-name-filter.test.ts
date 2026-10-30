import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("finds a project by name ignoring case in any alphabet", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-names-")), "fixture.db") }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }

  await run("projects", "add", "Тартус", "--key", "TAR")
  await run("projects", "add", "Research Example", "--key", "RES")

  const found = await run("projects", "list", "name:*ТАРТ*")
  expect(found.items.map(({ key }: { key: string }) => key)).toEqual(["TAR"])
})
