import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { answerFields } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("creates native note tasks through the CLI and connects context, search, assignments, tags and reminders", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-native-tasks-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
  const key = { provider: "telegram", account: "1" }
  const store = await openStore({ env })
  await store.accounts.saveAccount(key, { name: null })
  await store.accounts.saveAccount({ ...key, account: "2" }, { name: null })
  await store.people.savePeople(key, [{ id: "101", name: "Synthetic Person" }])
  const person = await store.people.personOf({ provider: key.provider, id: "101" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const scope = ["--source", `${key.provider}:${key.account}`]
  const acts = ["--account", `${key.provider}:${key.account}`]
  const added = await run("notes", "add", "Synthetic budget request", "--subject", `person:${person?.uid}`)
  const source = `note:${added.id}`
  await expect(run("tasks", "add", source)).rejects.toMatchObject({ code: "validation_error" })
  await expect(run("tasks", "add", source, "--account", "telegram")).rejects.toMatchObject({
    code: "validation_error",
  })
  const task = await run("tasks", "add", source, ...acts)
  expect(task).toMatchObject({
    created: true,
    task: { source, source_kind: "note", note: { text: "Synthetic budget request" } },
  })
  expect(await run("tasks", "add", source, ...acts)).toMatchObject({ created: false, task: { id: task.task.id } })
  expect((await run("tasks", "list", "--source", "telegram:2")).items).toEqual([])
  await expect(run("tasks", "close", task.task.id, "--account", "telegram:2")).rejects.toMatchObject({
    code: "not_found",
  })
  const unrelated = await run("notes", "add", "Unrelated budget")
  const other = await run("tasks", "add", `note:${unrelated.id}`, ...acts)
  expect(
    (await run("context", "telegram:101", "--source", "telegram:1")).tasks.items.map((item: { id: string }) => item.id),
  ).toEqual([task.task.id])
  await run("tasks", "assign", other.task.id, person?.uid as string)
  expect((await run("context", "telegram:101", "--source", "telegram:1")).tasks.items).toHaveLength(2)
  const search = await run("search", "all", "budget")
  type Step = { command: string; args: { query: string; source: string } }
  const steps: Step[] = search.next ?? []
  expect(steps.map(({ command, args }) => [command, args.query]).sort()).toEqual(
    [
      ["tasks list", `source:"${source}"`],
      ["tasks list", `source:"note:${unrelated.id}"`],
    ].sort(),
  )
  const step = steps.find(({ args }) => args.query === `source:"${source}"`) as Step
  expect(
    (await run("tasks", "list", step.args.query, "--source", step.args.source)).items.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual([task.task.id])
  await run("tags", "add", "budget", "--task", task.task.id, ...acts)
  expect(
    (await run("tags", "list", "tag:budget", ...scope)).items.find(({ type }: { type: string }) => type === "task"),
  ).toMatchObject({
    type: "task",
    id: task.task.id,
  })
  const reminder = await run("reminders", "add", task.task.id, "--at-time", "2026-01-01T00:00:00Z", ...acts)
  const [delivery] = (await run("reminders", "claim", ...acts)).items
  await run("reminders", "acknowledge", reminder.id, delivery.receipt, ...acts)
  expect((await run("reminders", "claim", ...acts)).items).toEqual([])
  await run("notes", "edit", source, "--text", "Updated budget", "--revision", "1")
  const listed = (await run("tasks", "list", ...scope)).items.find((item: { id: string }) => item.id === task.task.id)
  expect(listed).toMatchObject({ source_message: source, chat: null, state: "open", account: "telegram:1" })
  const list = createProgram({ streams: captureStreams(), env })
    .commands.find((command) => command.name() === "tasks")
    ?.commands.find((command) => command.name() === "list")
  expect(answerFields(list)).toEqual(expect.arrayContaining(Object.keys(listed)))
  await run("tasks", "close", task.task.id, ...acts)
  expect(await run("tasks", "add", source, ...acts)).toMatchObject({ created: false, task: { state: "done" } })
  await run("notes", "remove", source)
  expect((await run("tasks", "list", "state:done", ...scope)).items[0]).toMatchObject({
    id: task.task.id,
    state: "done",
  })
  await expect(run("tasks", "add", source, ...acts)).rejects.toMatchObject({ code: "not_found" })
})

it("adds a bug to a project with its fields and assignee, updates, lists and closes it", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-work-tasks-")), "store.db") }
  const key = { provider: "telegram", account: "1" }
  const store = await openStore({ env })
  await store.accounts.saveAccount(key, { name: null })
  await store.people.savePeople(key, [{ id: "101", name: "Bob Sample" }])
  const person = await store.people.personOf({ provider: key.provider, id: "101" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  await run("projects", "add", "Lighthouse", "--key", "LHT")

  await expect(run("tasks", "add", "--title", "No project", "--type", "bug")).rejects.toMatchObject({
    code: "validation_error",
  })
  await expect(run("tasks", "add", "--project", "LHT", "--title", "Asked", "--type", "question")).rejects.toMatchObject(
    {
      code: "validation_error",
    },
  )
  const bug = await run(
    "tasks",
    "add",
    "--project",
    "LHT",
    "--title",
    "Export drops the last row",
    "--type",
    "bug",
    "--priority",
    "1",
    "--assignee",
    person?.uid as string,
  )
  expect(bug).toMatchObject({
    id: "LHT-1",
    type: "bug",
    priority: 1,
    assignments: [{ to: `person:${person?.uid}`, role: "assignee" }],
  })
  const sub = await run("tasks", "add", "--project", "LHT", "--title", "Add a test", "--parent", bug.id)
  expect(sub).toMatchObject({ id: "LHT-2", type: "chore", parent: "task:LHT-1" })
  expect(await run("tasks", "update", bug.id, "--priority", "0")).toMatchObject({ priority: 0 })
  expect(await run("tasks", "assign", bug.id, person?.uid as string, "--role", "reviewer")).toMatchObject({
    assignments: [
      { to: `person:${person?.uid}`, role: "assignee" },
      { to: `person:${person?.uid}`, role: "reviewer" },
    ],
  })
  const project = (await run("tasks", "list", "project:LHT")).items
  expect(project.map((task: { id: string }) => task.id)).toEqual(["LHT-1", "LHT-2"])
  expect(project[0]).toMatchObject({ kind: "bug", state: "open", priority: 0, project: "project:1" })
  const list = createProgram({ streams: captureStreams(), env })
    .commands.find((command) => command.name() === "tasks")
    ?.commands.find((command) => command.name() === "list")
  expect(answerFields(list)).toEqual(expect.arrayContaining(Object.keys(project[0])))
  expect(await run("tasks", "close", bug.id, "--reason", "fixed")).toMatchObject({ status: "done", reason: "fixed" })
  expect((await run("tasks", "list", "state:done", "project:LHT")).items).toMatchObject([{ id: "LHT-1" }])
  expect((await run("tasks", "list", "kind:chore", "project:LHT")).items).toMatchObject([{ id: "LHT-2" }])
  await expect(run("tasks", "list", "kind:chore")).rejects.toMatchObject({ code: "validation_error" })
})
