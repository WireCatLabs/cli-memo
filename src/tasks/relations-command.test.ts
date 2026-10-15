import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("creates keyed project tasks, links them as before or with task:, and discovers ready work through an alias", async () => {
  const env = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-task-graph-test-")), "fixture.db"),
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const project = await run("projects", "add", "Research Example", "--key", "RES")
  const catalog = await run("vocabulary", "list", "--kind", "project")
  await run("vocabulary", "aliases", "add", project.ref, "Lab Example", "--expected", catalog.fingerprint)
  const first = await run("tasks", "add", "--project", "Lab Example", "--title", "Research draft")
  const second = await run("tasks", "add", "--project", "RES", "--title", "Review draft")
  expect([first.key, second.key]).toEqual(["RES-1", "RES-2"])
  const blocked = { relations: [{ from: second.ref, to: first.ref, kind: "blocked-by" }] }
  expect(await run("tasks", "link", second.id, first.id, "--kind", "blocked-by")).toMatchObject(blocked)
  expect(await run("tasks", "link", second.id, `task:${first.id}`, "--kind", "blocked-by")).toMatchObject(blocked)
  await expect(run("tasks", "link", second.id, "999", "--kind", "related-to")).rejects.toThrow("write task:999")
  await expect(run("tasks", "link", second.id, "https://example.com/plan")).rejects.toThrow(
    "give --provider and --account",
  )
  expect(await run("tasks", "list", "--ready", "--project", "Lab Example")).toMatchObject({
    items: [{ key: first.key }],
    page: { has_more: false },
  })
  expect(await run("tasks", "status", second.id)).toEqual({
    ready: false,
    blockers: [{ task: first.ref, state: "open" }],
  })
  await expect(run("tasks", "link", first.id, second.id, "--kind", "blocked-by")).rejects.toMatchObject({
    code: "validation_error",
  })
  expect(await run("tasks", "unlink", second.id, first.id, "--kind", "blocked-by")).toEqual({ changed: true })
  await run("tasks", "link", second.id, first.id, "--kind", "follow-up-of")
  expect((await run("tasks", "relations", second.id)).items).toMatchObject([{ kind: "follow-up-of" }])
  expect((await run("tasks", "list", "--ready", "--project", project.ref)).items).toHaveLength(2)
})
