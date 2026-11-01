import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = () => {
  const env = {
    ...process.env,
    AI_AGENT: "",
    CLAUDECODE: "",
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-memories-")), "store.db"),
  }
  const run = async (overrides: NodeJS.ProcessEnv, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...overrides } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  return {
    env,
    owner: (...args: string[]) => run({}, ...args),
    agent: (...args: string[]) => run({ AI_AGENT: "hermes" }, ...args),
  }
}

it("lets the owner correct an agent's memory, keeping the old one as superseded, and refuses an agent's correction", async () => {
  const { owner, agent } = setUp()
  const note = await owner("notes", "add", "Kai Sample: Fridays work best")
  const wrong = await agent(
    "memories",
    "add",
    "Kai Sample prefers Thursday calls",
    "--kind",
    "preference",
    "--scope",
    "work",
    "--evidence",
    note.ref,
  )

  await expect(
    agent(
      "memories",
      "add",
      "Kai Sample prefers Friday calls",
      "--kind",
      "preference",
      "--scope",
      "work",
      "--evidence",
      note.ref,
      "--supersedes",
      wrong.ref,
    ),
  ).rejects.toMatchObject({ code: "permission_error" })
  expect((await owner("memories", "list")).items).toHaveLength(1)

  const right = await owner(
    "memories",
    "add",
    "Kai Sample prefers Friday calls",
    "--kind",
    "preference",
    "--scope",
    "work",
    "--evidence",
    note.ref,
    "--supersedes",
    wrong.ref,
  )
  expect(right).toMatchObject({ status: "confirmed", supersedes: wrong.ref, author: { type: "person" } })
  expect(await owner("memories", "show", wrong.ref)).toMatchObject({ status: "superseded" })
})

it("forgets one memory or fact for good, leaving its sources and every other record", async () => {
  const { owner, agent } = setUp()
  const note = await owner("notes", "add", "Kai Sample: Fridays work best")
  const forgotten = await agent(
    "memories",
    "add",
    "Kai Sample dislikes mornings",
    "--kind",
    "preference",
    "--scope",
    "work",
    "--evidence",
    note.ref,
  )
  const kept = await agent(
    "memories",
    "add",
    "Kai Sample prefers Friday calls",
    "--kind",
    "preference",
    "--scope",
    "work",
    "--evidence",
    note.ref,
  )
  const fact = await agent("facts", "add", "Kai Sample promised the draft", "--kind", "promise", "--evidence", note.ref)

  expect(await owner("memories", "remove", forgotten.ref)).toEqual({ ref: forgotten.ref, removed: true, links: 1 })
  await expect(owner("memories", "show", forgotten.ref)).rejects.toMatchObject({ code: "not_found" })
  await expect(owner("memories", "remove", forgotten.ref)).rejects.toMatchObject({ code: "not_found" })
  expect(await owner("facts", "remove", fact.ref)).toEqual({ ref: fact.ref, removed: true, links: 1 })
  await expect(owner("facts", "show", fact.ref)).rejects.toMatchObject({ code: "not_found" })

  expect((await owner("memories", "list")).items.map(({ ref }: { ref: string }) => ref)).toEqual([kept.ref])
  expect(await owner("memories", "show", kept.ref)).toMatchObject({ evidence: [note.ref] })
  expect(await owner("notes", "show", note.ref)).toMatchObject({ ref: note.ref })
  expect((await owner("search", "memories", "mornings")).items).toEqual([])
})

it("rejects only a proposed fact, and names the subject and reads back each source", async () => {
  const { env, owner, agent } = setUp()
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Project Harbour", type: "work" })
  await store.close()
  const note = await owner("notes", "add", "Kai Sample: the harbour launch moves to March")
  const proposed = await agent(
    "facts",
    "add",
    "The launch moved to March",
    "--kind",
    "decision",
    "--evidence",
    note.ref,
    "--subject",
    project.ref,
  )
  const owned = await owner("facts", "add", "The launch is in spring", "--kind", "fact")

  await expect(owner("facts", "reject", owned.ref)).rejects.toMatchObject({ code: "validation_error" })
  expect(await owner("facts", "reject", proposed.ref)).toMatchObject({ status: "rejected" })
  expect((await owner("facts", "list", "status:rejected")).items).toMatchObject([
    { ref: proposed.ref, subject: project.ref, subject_name: "Project Harbour", subject_is_owner: false },
  ])
  expect(await owner("facts", "show", proposed.ref, "--sources")).toMatchObject({
    sources: [
      { ref: note.ref, kind: "note", excerpt: expect.stringContaining("March"), tool: "notes", missing: false },
    ],
  })

  const memory = await agent(
    "memories",
    "add",
    "The launch is in March",
    "--kind",
    "summary",
    "--scope",
    "work",
    "--evidence",
    note.ref,
    "--subject",
    project.ref,
  )
  expect((await owner("memories", "list")).items).toMatchObject([{ ref: memory.ref, subject_name: "Project Harbour" }])
  expect((await owner("memories", "show", memory.ref)).sources).toBeUndefined()
  expect(await owner("memories", "show", memory.ref, "--sources")).toMatchObject({
    sources: [{ ref: note.ref, kind: "note", title: null, sender: null, at: expect.any(String), missing: false }],
  })
})

it("gives a new memory or fact a new number after the newest one was forgotten", async () => {
  const { owner, agent } = setUp()
  const note = await owner("notes", "add", "Kai Sample: Fridays work best")
  const add = () =>
    agent(
      "memories",
      "add",
      "Kai Sample prefers Fridays",
      "--kind",
      "preference",
      "--scope",
      "work",
      "--evidence",
      note.ref,
    )
  const newest = await add()
  const fact = await agent("facts", "add", "Kai Sample promised the draft", "--kind", "promise", "--evidence", note.ref)
  await owner("memories", "remove", newest.ref)
  await owner("facts", "remove", fact.ref)

  expect((await add()).ref).not.toBe(newest.ref)
  expect(
    (await agent("facts", "add", "Kai Sample sent the draft", "--kind", "fact", "--evidence", note.ref)).ref,
  ).not.toBe(fact.ref)
  await expect(owner("memories", "show", newest.ref)).rejects.toMatchObject({ code: "not_found" })
})

it("keeps a memory in a project, by key, names it on memories and facts, filters by it, and moves it", async () => {
  const { owner, env } = setUp()
  const store = await openStore({ env })
  await store.knowledge.addProject({ name: "Project Harbour", key: "HRB", type: "work" })
  await store.knowledge.addProject({ name: "Lighthouse", key: "LHT", type: "work" })
  await store.close()
  const note = await owner("notes", "add", "Kai Sample: Fridays work best")
  const add = (...extra: string[]) =>
    owner(
      "memories",
      "add",
      "Kai prefers Fridays",
      "--kind",
      "preference",
      "--scope",
      "work",
      "--evidence",
      note.ref,
      ...extra,
    )

  const harbour = await add("--project", "HRB")
  const loose = await add()
  expect(harbour).toMatchObject({ project: "project:1", project_name: "Project Harbour" })
  expect(loose).toMatchObject({ project: null, project_name: null })
  expect((await owner("memories", "list", "project:HRB")).items).toMatchObject([{ ref: harbour.ref }])
  expect((await owner("memories", "show", harbour.ref)).project_name).toBe("Project Harbour")

  expect(await owner("memories", "update", loose.ref, "--project", "LHT")).toMatchObject({
    project: "project:2",
    project_name: "Lighthouse",
  })
  expect(await owner("memories", "update", harbour.ref, "--project", "none")).toMatchObject({ project: null })
  await expect(owner("memories", "update", harbour.ref, "--project", "NOPE")).rejects.toMatchObject({
    code: "not_found",
  })

  const fact = await owner("facts", "add", "Harbour moved to Fridays", "--kind", "decision", "--project", "HRB")
  expect(fact).toMatchObject({ project: "project:1", project_name: "Project Harbour" })
  expect((await owner("facts", "list", "project:HRB")).items).toMatchObject([{ project_name: "Project Harbour" }])
})
