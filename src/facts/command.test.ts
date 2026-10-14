import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("records the owner's facts as accepted and lets the owner accept, supersede and reverse an agent's decision", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-facts-")), "store.db") }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const note = await run("notes", "add", "Alice Example: we ship on Fridays")
  const said = await run("facts", "add", "Alice Example said releases go out on Fridays", "--kind", "statement")
  expect(said).toMatchObject({ kind: "statement", text: expect.stringContaining("Fridays"), origin: "owner" })

  const store = await openStore({ env })
  const proposed = await store.facts.add({
    type: "decision",
    statement: "Releases go out on Fridays",
    by: { bot: "memo-mcp" },
    evidence: [note.ref],
  })
  await store.close()
  expect((await run("facts", "list", "status:proposed")).items).toMatchObject([{ ref: proposed.ref }])
  expect(await run("facts", "confirm", proposed.ref)).toMatchObject({ status: "accepted" })

  const replacing = await run(
    "facts",
    "add",
    "Releases go out on Thursdays",
    "--kind",
    "decision",
    "--supersedes",
    proposed.ref,
  )
  expect(replacing).toMatchObject({ status: "accepted", supersedes: proposed.ref })
  expect(await run("facts", "show", proposed.ref)).toMatchObject({ status: "superseded" })
  expect(await run("facts", "reverse", replacing.ref)).toMatchObject({ status: "reversed" })
  await expect(run("facts", "reverse", said.ref)).rejects.toMatchObject({ code: "validation_error" })
  expect((await run("facts", "list", "kind:decision")).items).toHaveLength(2)
})

it("filters facts by a query in the store, and refuses the old flags and a question it cannot ask", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-facts-")), "store.db") }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const decided = await run("facts", "add", "Releases go out on Fridays", "--kind", "decision")
  await run("facts", "add", "Alice Example asked about Fridays", "--kind", "question")

  expect((await run("facts", "list", "kind:Decision", "status:accepted")).items).toMatchObject([{ ref: decided.ref }])
  const strict = createProgram({ streams: captureStreams(), env })
  const list = strict.commands.find((command) => command.name() === "facts")?.commands.find((c) => c.name() === "list")
  list?.exitOverride().configureOutput({ writeErr: () => {} })
  await expect(strict.parseAsync(["facts", "list", "--type", "decision"], { from: "user" })).rejects.toMatchObject({
    code: "commander.unknownOption",
  })
  await expect(run("facts", "list", "kind:decision OR kind:question")).rejects.toMatchObject({
    code: "validation_error",
  })
  await expect(run("facts", "list", "text:Fridays")).rejects.toMatchObject({ code: "validation_error" })
})
