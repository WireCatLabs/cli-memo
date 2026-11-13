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
  expect((await run("tasks", "update", task, "--priority", "high", ...acts, "--json")).json()).toMatchObject({
    item: { priority: 0.625, priority_label: "high" },
  })
  expect((await run("tasks", "show", task, ...scope, "--json")).json()).toMatchObject({
    item: { key: task, title: "Hand over the keys" },
  })
  expect((await run("stats", "tasks", "show", ...scope, "--json")).json().item).toMatchObject({ open: 1 })
})

it("**counts tasks across every stored account** when stats tasks show names none, and says which", async () => {
  const { env, run } = await setUp()
  const other = { provider: "telegram", account: "600" }
  const store = await openStore({ env })
  await store.accounts.saveAccount(other, { name: null })
  await store.chats.saveChats(other, [
    { id: "7", title: null, kind: "dialog", unreadCount: 0, lastMessageAt: null, participantsCount: null },
  ])
  await store.messages.saveMessages(other, "7", [said("1", 40, "can you send the deck?")], { via: "test" })
  await applyTaskRulesToStored(store, other)
  await store.close()

  const all = (await run("stats", "tasks", "show", "--json")).json().item
  expect(all).toMatchObject({ accounts: ["telegram:500", "telegram:600"], open: 2 })
  expect(all.rows.map(({ chat }: { chat: string }) => chat).sort()).toEqual([
    "chat:telegram/500/7",
    "chat:telegram/600/7",
  ])
  expect((await run("stats", "tasks", "show", ...scope, "--json")).json().item).toMatchObject({ open: 1 })
  await expect(run("stats", "tasks", "show", "--json", "--", "chat:7")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("one account"),
  })
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

it("**tasks agenda over a mail account lists threads owed an answer and waiting for one**", async () => {
  const { env, run } = await setUp()
  const mailbox = { provider: "email", account: "me@example.com" }
  const store = await openStore({ env })
  try {
    const accountId = await store.accounts.saveAccount(mailbox, { name: null })
    const hoursAgo = (hours: number) => Date.now() - hours * 3_600_000
    const ann = { address: "ann@example.com", name: "Ann Example" }
    const me = { address: mailbox.account, name: null }
    const email = (id: string, hours: number, extra: Record<string, unknown> = {}) => ({
      externalId: `<${id}@example.com>`,
      subject: `Synthetic ${id}`,
      from: ann,
      to: [me],
      sentAt: hoursAgo(hours),
      receivedAt: hoursAgo(hours),
      bodyText: `synthetic ${id}`,
      ...extra,
    })
    await store.mail.saveThread({ accountId, externalId: "owed", now: Date.now(), emails: [email("ask", 48)] })
    await store.mail.saveThread({
      accountId,
      externalId: "waiting",
      now: Date.now(),
      emails: [email("asked", 24 * 10), email("mine", 24 * 8, { from: me, to: [ann], outgoing: true })],
    })
    await store.sync.setSyncState(mailbox, "mail_coverage", JSON.stringify({ state: "window" }))
  } finally {
    await store.close()
  }

  const agenda = (await run("tasks", "agenda", "--source", "email:me@example.com", "--json")).json().item

  expect(agenda.owed.map((one: { chat: string }) => one.chat)).toEqual(["chat:email/me%40example.com/owed"])
  expect(agenda.waiting.map((one: { chat: string }) => one.chat)).toEqual(["chat:email/me%40example.com/waiting"])
  expect(agenda.stale).toBe(false)
  const waiting = async (...args: string[]) =>
    (await run("tasks", "agenda", "--source", "email:me@example.com", ...args, "--json")).json().item.waiting
  expect(await waiting("--waiting", "9d")).toEqual([])
  expect(await waiting("--within", "5d")).toEqual([])
  expect(await waiting("--waiting", "7d", "--within", "9d")).toHaveLength(1)
})

it("counts tasks by project instead of chat, and reads a period's days in the zone asked", async () => {
  const { run } = await setUp()
  const stats = async (...args: string[]) =>
    (await run("stats", "tasks", "show", ...scope, "--json", ...args)).json().item
  expect((await stats()).rows).toEqual([expect.objectContaining({ chat: "chat:telegram/500/7", open: 1 })])
  expect(await stats("--by", "project")).toMatchObject({ open: 0, rows: [] })
  expect(await stats("--type", "question")).toMatchObject({ open: 1 })
  expect(await stats("--type", "promise")).toMatchObject({ open: 0 })
  // Kiritimati's today began at most a day ago; the same date begins 25 hours later in Pago Pago.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(new Date())
  expect(await stats("--timezone", "Pacific/Kiritimati", "--", `created>=${today}`)).toMatchObject({ created: 1 })
  expect(await stats("--timezone", "Pacific/Pago_Pago", "--", `created>=${today}`)).toMatchObject({ created: 0 })
})

it("**narrows the agenda by --due-within and --unanswered, and hides a task another --holder claimed**", async () => {
  const { run } = await setUp()
  const agenda = async (...args: string[]) => (await run("tasks", "agenda", ...scope, ...args, "--json")).json().item
  const task = (await agenda()).tasks[0].key
  await run("tasks", "update", task, "--due", "2d", ...acts, "--json")
  expect((await agenda()).tasks).toEqual([])
  expect((await agenda("--due-within", "3d")).tasks.map(({ key }: { key: string }) => key)).toEqual([task])

  expect((await agenda("--unanswered", "30m")).owed.map(({ chat }: { chat: string }) => chat)).toEqual([
    "chat:telegram/500/7",
  ])
  expect((await agenda("--unanswered", "2h")).owed).toEqual([])

  await run("tasks", "claim", task, ...acts, "--holder", "session-1", "--json")
  const held = async (holder: string) =>
    (await agenda("--due-within", "3d", "--holder", holder)).tasks.map(({ key }: { key: string }) => key)
  expect(await held("session-1")).toEqual([task])
  expect(await held("session-2")).toEqual([])
})

it("**files a message's task under a category with a reminder, and links it to a chat**", async () => {
  const { run } = await setUp()
  const task = (await run("tasks", "agenda", ...scope, "--json")).json().item.tasks[0].key
  const update = ["tasks", "update", task, "--category", "documents", "--remind-time", "2099-01-01T09:00:00Z", ...acts]
  expect((await run(...update, "--json")).json().item).toMatchObject({
    category: "documents",
    next_check_at: "2099-01-01T09:00:00.000Z",
  })
  expect((await run("tasks", "link", task, "--chat", "7", ...acts, "--json")).json().item.links).toMatchObject([
    { to: "chat:telegram/500/7", kind: "related-to" },
  ])
})
