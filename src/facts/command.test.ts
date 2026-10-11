import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-messaging/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

it("records the owner's facts as accepted and lets the owner accept, supersede and reverse an agent's decision", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-facts-")), "store.db") }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  const note = await run("notes", "add", "Alice Example: we ship on Fridays")
  const said = await run("facts", "add", "Alice Example said releases go out on Fridays", "--type", "statement")
  expect(said).toMatchObject({ type: "statement", status: "accepted" })

  const store = await openStore({ env })
  const proposed = await store.facts.add({
    type: "decision",
    statement: "Releases go out on Fridays",
    by: { bot: "memo-mcp" },
    evidence: [note.note.ref],
  })
  await store.close()
  expect((await run("facts", "list", "--status", "proposed")).items).toMatchObject([{ ref: proposed.ref }])
  expect(await run("facts", "accept", proposed.ref)).toMatchObject({ status: "accepted" })

  const replacing = await run(
    "facts",
    "add",
    "Releases go out on Thursdays",
    "--type",
    "decision",
    "--supersedes",
    proposed.ref,
  )
  expect(replacing).toMatchObject({ status: "accepted", supersedes: proposed.ref })
  expect(await run("facts", "show", proposed.ref)).toMatchObject({ status: "superseded" })
  expect(await run("facts", "reverse", replacing.ref)).toMatchObject({ status: "reversed" })
  await expect(run("facts", "reverse", said.ref)).rejects.toMatchObject({ code: "validation_error" })
  expect((await run("facts", "list", "--type", "decision")).items).toHaveLength(2)
})
