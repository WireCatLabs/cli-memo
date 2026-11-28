import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { addNote } from "../test/notes.js"
import { createProgram } from "./program.js"

const setUp = () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "wcat-flags-")), "s.db") }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  return { run, env }
}

it("takes a project by its key or project:<id> in every --project", async () => {
  const { run, env } = setUp()
  const project = await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  const note = await addNote(env, "Synthetic note")
  const fact = await run(
    "facts",
    "add",
    "Ships on Fridays",
    "--kind",
    "decision",
    "--evidence",
    note.ref,
    "--project",
    "SYH",
  )

  expect(fact.project).toBe(project.ref)
  expect((await run("facts", "list", "project:SYH")).items).toMatchObject([{ ref: fact.ref }])
  expect((await run("facts", "list", `project:"${project.ref}"`)).items).toMatchObject([{ ref: fact.ref }])
  expect(await run("tags", "add", "harbour", "--project", "SYH")).toMatchObject({
    target: { type: "project", id: project.ref.slice("project:".length) },
  })
})
