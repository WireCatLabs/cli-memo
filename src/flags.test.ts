import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { createProgram } from "./program.js"

const setUp = () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-flags-")), "s.db") }
  return async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
}

it("takes a project by its key or project:<id> in every --project", async () => {
  const run = setUp()
  const project = await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  const note = await run("notes", "add", "Synthetic note")
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

it("takes --about once per subject", async () => {
  const run = setUp()
  const project = await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  const organization = await run("organizations", "add", "Synthetic Studio", "--kind", "company")
  const added = await run("notes", "add", "About both", "--about", project.ref, "--about", organization.ref)

  for (const subject of [project.ref, organization.ref])
    expect((await run("notes", "list", "--about", subject)).items).toMatchObject([{ id: added.id }])
})
