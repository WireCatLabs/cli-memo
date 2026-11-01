import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-task-board-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
  const store = await openStore({ env })
  await store.knowledge.addProject({ name: "Harbour launch", key: "HRB" })
  await store.knowledge.addProject({ name: "Operations", key: "OPS" })
  await store.people.savePeople({ provider: "telegram", account: "1" }, [{ id: "101", name: "Ana Example" }])
  const ana = await store.people.personOf({ provider: "telegram", id: "101" })
  await store.close()
  const run = async (args: string[], more: NodeJS.ProcessEnv = {}) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...more } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  return { run, ana: `person:${ana?.uid}` }
}

it("lists every project's open work with a query, a sort, a cursor and a total", async () => {
  const { run, ana } = await setUp()
  await run(["tasks", "add", "--project", "HRB", "--title", "Send the invoice", "--priority", "critical"])
  await run(["tasks", "add", "--project", "HRB", "--title", "Print badges", "--priority", "low"])
  await run(["tasks", "add", "--project", "OPS", "--title", "Renew the domain", "--assignee", ana])
  await run(["tasks", "update", "OPS-1", "--status", "in_progress"])
  await run(["tasks", "close", "HRB-2", "--as", "dismissed"])
  await run(["tasks", "link", "HRB-1", "OPS-1", "--kind", "blocked-by"])

  const first = await run(["tasks", "list", "project:*", "--limit", "1", "--sort", "key"])
  expect(first.page).toMatchObject({ mode: "cursor", limit: 1, has_more: true, total: { value: 2, relation: "eq" } })
  expect(first.items[0]).toMatchObject({
    key: "HRB-1",
    state: "open",
    kind: "chore",
    priority: 0.875,
    priority_label: "critical",
    agent: null,
    revision: expect.any(Number),
    assignments: [],
    ready: false,
    blocked_by: [{ task: "task:OPS-1", state: "open" }],
  })
  const second = await run([
    "tasks",
    "list",
    "project:*",
    "--limit",
    "1",
    "--sort",
    "key",
    "--cursor",
    first.page.next_cursor,
  ])
  expect(second.items.map(({ key }: { key: string }) => key)).toEqual(["OPS-1"])
  expect(second.items[0]).toMatchObject({ state: "in_progress", assignments: [{ to: ana, role: "assignee" }] })
  expect(second.page).toMatchObject({ has_more: false })
  await expect(
    run(["tasks", "list", "project:HRB", "--limit", "1", "--cursor", first.page.next_cursor]),
  ).rejects.toMatchObject({ code: "validation_error" })

  const keys = async (...query: string[]) =>
    (await run(["tasks", "list", ...query])).items.map(({ key }: { key: string }) => key)
  expect(await keys("project:(HRB OR OPS)", "state:dismissed")).toEqual(["HRB-2"])
  expect(await keys("project:*", "invoice")).toEqual(["HRB-1"])
  expect(await keys("project:*", `assignee:"${ana}"`)).toEqual(["OPS-1"])
  expect(await keys("project:*", "state:(done OR dismissed)", "closed:>=1d")).toEqual(["HRB-2"])
  expect(await keys("project:*", "closed:>=1d")).toEqual([])
  await expect(run(["tasks", "list", "priority:high"])).rejects.toThrow("project:*")
})

it("counts project tasks for the pickers, and keeps an account's list as it was", async () => {
  const { run } = await setUp()
  await run(["tasks", "add", "--project", "HRB", "--title", "A"])
  await run(["tasks", "add", "--project", "OPS", "--title", "B"])
  await run(["tasks", "update", "OPS-1", "--status", "todo"])

  const counts = await run(["tasks", "counts", "project:HRB"])
  expect(counts.total).toBe(1)
  expect(counts.project).toEqual([
    { value: "HRB", ref: "project:1", name: "Harbour launch", count: 1 },
    { value: "OPS", ref: "project:2", name: "Operations", count: 1 },
  ])
  expect(counts.state.find(({ value }: { value: string }) => value === "todo")).toEqual({ value: "todo", count: 0 })
  expect((await run(["tasks", "list"])).items).toEqual([])
})

it("moves, reopens, unassigns and tells the history, naming the agent that acted", async () => {
  const { run, ana } = await setUp()
  await run(["tasks", "add", "--project", "HRB", "--title", "Book the venue", "--assignee", ana])
  await run(["tasks", "add", "--project", "HRB", "--title", "Sub", "--parent", "HRB-1"])
  expect(await run(["tasks", "update", "HRB-2", "--parent", "none"])).toMatchObject({ parent: null })
  await run(["tasks", "update", "HRB-1", "--status", "in_progress"], { AI_AGENT: "hermes" })
  await run(["tasks", "close", "HRB-1", "--as", "done"], { AI_AGENT: "hermes" })
  expect(await run(["tasks", "update", "HRB-1", "--status", "todo"])).toMatchObject({ status: "todo", closed_at: null })
  expect((await run(["tasks", "assign", "HRB-1", ana, "--clear"])).assignments).toEqual([])

  const history = await run(["tasks", "history", "HRB-1"])
  const who = ({ kind, by }: { kind: string; by: { name: string | null; owner: boolean } }) => [
    kind,
    by.owner ? "owner" : by.name,
  ]
  expect(history.items.map(who)).toEqual([
    ["created", "owner"],
    ["assigned", "owner"],
    ["status", "hermes"],
    ["status", "hermes"],
    ["status", "owner"],
    ["unassigned", "owner"],
  ])
  expect(history.items[2]).toMatchObject({
    at: expect.any(String),
    kind: "status",
    by: { ref: expect.stringMatching(/^bot:\d+$/), name: "hermes", owner: false },
    changes: { status: ["open", "in_progress"] },
  })
})

it("adds a person by name, and lists everyone memo knows to assign", async () => {
  const { run, ana } = await setUp()
  await run(["tasks", "add", "--project", "HRB", "--title", "A", "--assignee", ana])
  const lena = await run(["people", "add", "Lena", "Example"])
  expect(lena).toMatchObject({ ref: expect.stringMatching(/^person:\d+$/), name: "Lena Example" })
  await run(["tasks", "add", "--project", "HRB", "--title", "B", "--assignee", lena.ref])

  const people = await run(["people", "list"])
  expect(people.items[0]).toMatchObject({ owner: true })
  expect(people.items.filter(({ owner }: { owner: boolean }) => !owner)).toEqual([
    { ref: ana, name: "Ana Example", owner: false, tasks: 1 },
    { ref: lena.ref, name: "Lena Example", owner: false, tasks: 1 },
  ])
  expect((await run(["people", "list", "--limit", "1"])).items).toHaveLength(1)
})

it("adds a task with its due date, state and agent at once, and names its project as counts do", async () => {
  const { run } = await setUp()
  const added = await run([
    "tasks",
    "add",
    "--project",
    "HRB",
    "--title",
    "Book the venue",
    "--due",
    "2d",
    "--status",
    "in_progress",
    "--agent",
    "hermes",
    "--priority",
    "0.3",
    "--description",
    "Two rooms",
  ])
  expect(added).toMatchObject({ status: "in_progress", agent: "hermes", priority: 0.3, due_at: expect.any(String) })
  await expect(run(["tasks", "add", "note:1", "--due", "2d"])).rejects.toMatchObject({ code: "validation_error" })

  const [listed] = (await run(["tasks", "list", "project:HRB"])).items
  expect(listed).toMatchObject({ project: "project:1", project_key: "HRB", project_name: "Harbour launch" })
  expect(await run(["tasks", "update", "HRB-1", "--description", "none"])).toMatchObject({ description: null })

  const counts = await run(["tasks", "counts", "project:HRB"])
  expect(counts.due).toEqual([
    { value: "overdue", count: 0 },
    { value: "today", count: 0 },
    { value: "upcoming", count: 1 },
    { value: "later", count: 0 },
    { value: "none", count: 0 },
  ])
  expect(counts.agent).toEqual([{ value: "hermes", count: 1 }])
  expect((await run(["tasks", "list", "project:HRB", "when:upcoming"])).items).toHaveLength(1)
  expect((await run(["tasks", "list", "project:HRB", "overdue:true"])).items).toEqual([])

  const due = (await run(["tasks", "history", "HRB-1"])).items.find(({ kind }: { kind: string }) => kind === "due")
  expect(due.changes.due_at[1]).toBe(listed.due_at)
})

it("moves a card between two others, says when its label changed, and refuses a stale revision", async () => {
  const { run } = await setUp()
  await run(["tasks", "add", "--project", "HRB", "--title", "A", "--priority", "critical"])
  await run(["tasks", "add", "--project", "HRB", "--title", "B", "--priority", "high"])
  const c = await run(["tasks", "add", "--project", "OPS", "--title", "C", "--priority", "medium"])

  const moved = await run(["tasks", "move", "OPS-1", "--before", "HRB-2", "--revision", String(c.revision)])
  expect(moved).toMatchObject({
    task: { key: "OPS-1", priority_label: "critical", revision: c.revision + 1 },
    label: { from: "medium", to: "critical", changed: true },
    renumbered: [],
  })
  const column = await run(["tasks", "list", "project:*", "--json"])
  expect(column.items.map(({ key }: { key: string }) => key)).toEqual(["HRB-1", "OPS-1", "HRB-2"])
  await expect(
    run(["tasks", "update", "OPS-1", "--title", "D", "--revision", String(c.revision)]),
  ).rejects.toMatchObject({
    code: "configuration_error",
    details: { reason: "task.stale" },
  })
  expect(await run(["tasks", "update", "OPS-1", "--agent", "hermes"])).toMatchObject({ agent: "hermes" })
  expect(
    (await run(["tasks", "list", "project:*", "agent:hermes"])).items.map(({ key }: { key: string }) => key),
  ).toEqual(["OPS-1"])
  expect(await run(["tasks", "update", "OPS-1", "--agent", "none"])).toMatchObject({ agent: null })
})

it("moves a card into the column of the task it is dropped beside, and clears a priority with none", async () => {
  const { run } = await setUp()
  await run(["tasks", "add", "--project", "HRB", "--title", "A", "--priority", "high"])
  await run(["tasks", "add", "--project", "HRB", "--title", "B"])
  await run(["tasks", "update", "HRB-2", "--status", "in_progress"])

  expect(await run(["tasks", "move", "HRB-1", "--after", "HRB-2"])).toMatchObject({
    task: { key: "HRB-1", status: "in_progress" },
  })
  await run(["tasks", "update", "HRB-1", "--status", "done"])
  await expect(run(["tasks", "move", "HRB-1", "--status", "todo", "--before", "HRB-2"])).rejects.toMatchObject({
    code: "validation_error",
    details: { reason: "task.column" },
  })
  expect(await run(["tasks", "update", "HRB-1", "--priority", "none"])).toMatchObject({
    priority: null,
    priority_label: null,
  })
})

it("moves a task to another project, changes its kind and keeps comments with their author", async () => {
  const { run } = await setUp()
  const added = await run(["tasks", "add", "--project", "HRB", "--title", "Renew the domain"])
  expect(added.created_by).toMatchObject({ type: "person", owner: true })
  const moved = await run(["tasks", "update", "HRB-1", "--project", "OPS", "--revision", String(added.revision)])
  expect(moved).toMatchObject({ key: "OPS-1", id: "OPS-1" })
  expect(await run(["tasks", "show", "HRB-1"])).toMatchObject({ key: "OPS-1" })
  expect(await run(["tasks", "update", "OPS-1", "--type", "bug"])).toMatchObject({ type: "bug" })
  await expect(run(["tasks", "update", "OPS-1", "--type", "question"])).rejects.toBeDefined()

  await run(["tasks", "comments", "add", "OPS-1", "Paid", "for", "two", "years"], { AI_AGENT: "hermes" })
  await run(["tasks", "comments", "add", "HRB-1", "Thanks"])
  const comments = await run(["tasks", "comments", "list", "OPS-1"])
  expect(
    comments.items.map(({ text, author }: { text: string; author: { name: string | null; owner: boolean } }) => [
      text,
      author.owner ? "owner" : author.name,
    ]),
  ).toEqual([
    ["Paid for two years", "hermes"],
    ["Thanks", "owner"],
  ])
  const [listed] = (await run(["tasks", "list", "project:OPS"])).items
  expect(listed.created_by).toMatchObject({ owner: true })
  expect((await run(["tasks", "list", "project:OPS", "due:tomorrow"])).items).toEqual([])
})
