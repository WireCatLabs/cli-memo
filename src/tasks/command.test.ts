import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-messaging/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

it("creates native note tasks through the CLI and connects context, search, assignments, tags and reminders", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-native-tasks-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
  const key = { provider: "telegram", account: "1" }
  const store = await openStore({ env })
  await store.saveAccount(key, { name: null })
  await store.saveAccount({ ...key, account: "2" }, { name: null })
  await store.savePeople(key, [{ id: "101", name: "Synthetic Person" }])
  const person = await store.personOf({ provider: key.provider, id: "101" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  const scope = ["--provider", key.provider, "--account", key.account]
  const added = await run("notes", "add", "Synthetic budget request", "--about", `person:${person?.uid}`)
  const source = `note:${added.note.id}`
  await expect(run("tasks", "add", source)).rejects.toMatchObject({ code: "validation_error" })
  await expect(run("tasks", "add", source, "--provider", "telegram")).rejects.toMatchObject({
    code: "validation_error",
  })
  const task = await run("tasks", "add", source, ...scope)
  expect(task).toMatchObject({
    created: true,
    task: { source, sourceKind: "note", note: { text: "Synthetic budget request" } },
  })
  expect(await run("tasks", "add", source, ...scope)).toMatchObject({ created: false, task: { id: task.task.id } })
  expect((await run("tasks", "list", "--provider", "telegram", "--account", "2")).items).toEqual([])
  await expect(run("tasks", "close", task.task.id, "--provider", "telegram", "--account", "2")).rejects.toMatchObject({
    code: "not_found",
  })
  const unrelated = await run("notes", "add", "Unrelated budget")
  const other = await run("tasks", "add", `note:${unrelated.note.id}`, ...scope)
  expect(
    (await run("context", "telegram:101", "--account", "1")).tasks.items.map((item: { id: string }) => item.id),
  ).toEqual([task.task.id])
  await run("tasks", "assign", other.task.id, person?.uid as string, ...scope)
  expect((await run("context", "telegram:101", "--account", "1")).tasks.items).toHaveLength(2)
  const search = await run("search", "all", "budget")
  expect(search.tasks.map((item: { source: string }) => item.source).sort()).toEqual(
    [source, `note:${unrelated.note.id}`].sort(),
  )
  await run("tags", "add", "budget", "--task", task.task.id, ...scope)
  expect((await run("tags", "list", "--tag", "budget", ...scope)).knowledge[0].target).toMatchObject({
    type: "task",
    id: task.task.id,
  })
  const reminder = await run("reminders", "schedule", task.task.id, "--at", "2026-01-01T00:00:00Z", ...scope)
  const [delivery] = await run("reminders", "poll", ...scope)
  await run("reminders", "ack", reminder.id, delivery.receipt, ...scope)
  expect(await run("reminders", "poll", ...scope)).toEqual([])
  await run("notes", "edit", source, "--text", "Updated budget", "--revision", "1")
  expect(
    (await run("tasks", "list", ...scope)).items.find((item: { id: string }) => item.id === task.task.id).note.text,
  ).toBe("Updated budget")
  await run("tasks", "close", task.task.id, ...scope)
  expect(await run("tasks", "add", source, ...scope)).toMatchObject({ created: false, task: { state: "done" } })
  await run("notes", "remove", source)
  expect((await run("tasks", "list", "--state", "done", ...scope)).items[0]).toMatchObject({
    id: task.task.id,
    note: null,
    message: null,
  })
  await expect(run("tasks", "add", source, ...scope)).rejects.toMatchObject({ code: "not_found" })
})
