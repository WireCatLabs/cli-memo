import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { applyTaskRulesToStored } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

const key = { provider: "telegram", account: "500" }
const scope = ["--source", "telegram:500"]
const acts = ["--account", "telegram:500"]
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const said = (id: string, minutes: number, text: string, extra: Partial<Message> = {}): Message => ({
  id,
  chatId: "7",
  senderId: extra.outgoing ? "500" : "9",
  senderName: extra.outgoing ? null : "Alice Example",
  timestamp: minutesAgo(minutes),
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
  ...extra,
})

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-shared-tasks-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const store = await openStore({ env })
  await store.accounts.saveAccount(key, { name: null })
  await store.chats.saveChats(key, [
    { id: "7", title: null, kind: "dialog", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await store.messages.saveMessages(key, "7", [said("1", 60, "morning"), said("2", 50, "who has the keys?")], {
    via: "test",
  })
  await store.people.savePeople(key, [{ id: "9", name: "Alice Example" }])
  // tg opens this task when it syncs; memo reads the same store.
  await applyTaskRulesToStored(store, key)
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return { out: streams.stdout.join(""), json: () => JSON.parse(streams.stdout.join("")) }
  }
  return { env, run }
}

it("**mounts tg's tasks agenda, show and stats tasks show**, and plans a message's task with tasks update", async () => {
  const { run } = await setUp()

  const agenda = (await run("tasks", "agenda", ...scope, "--json")).json()
  expect(agenda.item.tasks).toHaveLength(1)
  const task = agenda.item.tasks[0].key
  expect(
    (await run("tasks", "update", task, "--title", "Hand over the keys", "--due", "2d", ...acts, "--json")).json(),
  ).toMatchObject({ item: { title: "Hand over the keys" } })
  const assigned = (await run("tasks", "update", task, "--assignee", "sender", ...acts, "--json")).json()
  const [assignee] = assigned.item.assignments
  expect(assignee).toMatchObject({ to: expect.stringMatching(/^person:/), role: "assignee" })
  const uid = assignee.to.slice("person:".length)
  expect((await run("tasks", "update", task, "--assignee", uid, ...acts, "--json")).json().item.assignments).toEqual([
    assignee,
  ])
  await expect(run("tasks", "update", task, "--priority", "1", ...acts)).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("in a project"),
  })
  expect((await run("tasks", "show", task, ...scope, "--json")).json()).toMatchObject({
    item: { key: task, title: "Hand over the keys" },
  })
  expect((await run("stats", "tasks", "show", ...scope, "--json")).json().item).toMatchObject({ open: 1 })
})

it("refuses a shared task command that names no account, and lists the ones the store holds", async () => {
  const { run } = await setUp()

  await expect(run("tasks", "agenda", "--json")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("--source telegram:500"),
  })
})

it("shows a project task with no account, and still asks for one for a messenger account's task", async () => {
  const { run } = await setUp()
  const project = (await run("projects", "add", "Harbour Example", "--key", "HRB", "--json")).json()
  const made = (await run("tasks", "add", "--project", "HRB", "--title", "Send the survey", "--json")).json()
  const shown = { item: { key: "HRB-1", title: "Send the survey", project: project.item.ref } }
  expect((await run("tasks", "show", made.item.key, "--json")).json()).toMatchObject(shown)
  expect((await run("tasks", "show", "task:HRB-1", "--json")).json()).toMatchObject(shown)

  const inbox = (await run("tasks", "agenda", ...scope, "--json")).json().item.tasks[0]
  for (const id of [inbox.key, inbox.id, "HRB-2"])
    await expect(run("tasks", "show", id, "--json")).rejects.toMatchObject({
      message: expect.stringContaining("--source telegram:500"),
    })
})

it("**claims and releases a task** with tg's builders, one holder at a time, for a project task too", async () => {
  const { run } = await setUp()
  const task = (await run("tasks", "agenda", ...scope, "--json")).json().item.tasks[0].key
  const mine = [...acts, "--holder", "session-1", "--json"]

  expect((await run("tasks", "claim", task, "--lease", "2h", ...mine)).json().item).toMatchObject({
    claimed_by: "session-1",
  })
  await expect(run("tasks", "claim", task, ...acts, "--holder", "session-2", "--json")).rejects.toMatchObject({
    message: expect.stringContaining("session-1 holds task"),
  })
  expect((await run("tasks", "release", task, ...mine)).json().item.claimed_by).toBeNull()

  await run("projects", "add", "Harbour Example", "--key", "HRB", "--json")
  await run("tasks", "add", "--project", "HRB", "--title", "Send the survey", "--json")
  expect((await run("tasks", "claim", "HRB-1", "--holder", "session-1", "--json")).json().item.claimed_by).toBe(
    "session-1",
  )
  await expect(run("tasks", "claim", task, "--holder", "session-1", "--json")).rejects.toMatchObject({
    message: expect.stringContaining("--account telegram:500"),
  })
})
