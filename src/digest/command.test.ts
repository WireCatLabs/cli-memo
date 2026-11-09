import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { applyTaskRulesToStored } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it, vi } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { storeMail } from "../../test/mail-store.js"
import { createProgram } from "../program.js"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()
const MAILBOX = "owner@example.test"
const tg = { provider: "telegram", account: "1" }

afterEach(() => {
  process.exitCode = 0
})

const message = (id: string, chatId: string, hours: number, text: string, outgoing = false): Message => ({
  id,
  chatId,
  senderId: outgoing ? "1" : "9",
  senderName: outgoing ? null : "Kai Sample",
  timestamp: ago(hours),
  editedAt: null,
  text,
  outgoing,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-digest-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
  }
  const store = await openStore({ env })
  await store.accounts.saveAccount(tg, { name: "Kai Owner" })
  await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
  const chats = [
    { id: "10", title: "Kai Sample", kind: "dialog" },
    { id: "11", title: "Answered", kind: "dialog" },
    { id: "12", title: "Harbour crew", kind: "group" },
    { id: "13", title: "Ferry Bot", kind: "dialog", providerMetadata: { isBot: true } },
    { id: "777000", title: "Telegram", kind: "dialog" },
  ] as const
  await store.chats.saveChats(
    tg,
    chats.map((chat) => ({ ...chat, unreadCount: 0, lastMessageAt: null, participantsCount: 2 })),
  )
  await store.messages.saveMessages(tg, "13", [message("6", "13", 1, "Your ferry ticket is ready")], { via: "test" })
  await store.messages.saveMessages(tg, "777000", [message("7", "777000", 1, "Login code 00000")], { via: "test" })
  await store.messages.saveMessages(tg, "10", [message("1", "10", 3, "Can you send the harbour plan?")], {
    via: "test",
  })
  await store.messages.saveMessages(tg, "11", [message("2", "11", 5, "Ping"), message("3", "11", 4, "Done", true)], {
    via: "test",
  })
  await store.messages.saveMessages(
    tg,
    "12",
    [message("4", "12", 2, "Crew meets at the pier"), message("5", "12", 40, "Old crew news")],
    { via: "test" },
  )
  const email = (
    uid: string,
    hours: number,
    subject: string,
    listId?: string,
    from = ["Rin Example", "rin@example.test"],
  ) => ({
    uid,
    messageId: `m${uid}`,
    threadId: `t${uid}`,
    receivedAt: ago(hours),
    subject,
    from: from as [string, string],
    to: [[null, MAILBOX]] as [string | null, string][],
    text: "Synthetic mail.",
    ...(listId ? { listId } : {}),
  })
  await storeMail(
    store,
    MAILBOX,
    [
      email("1", 2, "Quote for the pier"),
      email("2", 1, "Weekly news", "news.example.test"),
      email("3", 3, "Can we talk about a pier?", undefined, ["Nova Stranger", "nova@stranger.test"]),
      {
        ...email("4", 30, "Earlier quote", undefined, ["Owner", MAILBOX]),
        threadId: "t4",
        to: [["Rin Example", "rin@example.test"]] as [string | null, string][],
      },
    ],
    {
      since: new Date(Date.now() - 3 * 86_400_000),
    },
  )
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  /** A file of another WireCat CLI's state or config folder, as that CLI writes it. */
  const write = (dir: "data" | "xdg-config", path: string, value: unknown) => {
    const file = join(root, dir, path)
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
  }
  const schedule = (
    app: string,
    name: string,
    environment: Record<string, string>,
    last?: object,
    kind = "command",
  ) => {
    const argv = kind === "command" ? ["sync"] : ["claude", "-p", "Run memo skill show morning-digest."]
    write("data", `${app}/schedules/${name}/schedule.json`, { name, kind, argv, environment, when: { every: 5 } })
    if (last) write("data", `${app}/schedules/${name}/last.json`, { output: "run.log", ...last })
  }
  return { run, env, write, schedule }
}

const section = (body: { item: { sections: { name: string }[] } }, name: string) =>
  body.item.sections.find((one) => one.name === name) as unknown as {
    total: number
    items: { ref: string; who: string | null; why: string; excerpt: string | null }[]
    next: string[]
  }

it("puts the watch list first, then replies owed in messengers and personal mail, and leaves list mail out", async () => {
  const { run } = await setUp()
  await run("tags", "add", "watch", "--chat", "12", "--account", "telegram:1")
  await run("tags", "add", "watch", "--project", "SYH")
  const body = envelopeOf(await run("review", "agenda", "--json"))

  expect(body.item.sections.map((one: { name: string }) => one.name)).toEqual([
    "watch",
    "owed",
    "mail",
    "meetings",
    "tasks",
    "projects",
    "sources",
    "proposals",
  ])
  expect(section(body, "watch").items).toEqual([
    expect.objectContaining({ ref: "msg:telegram/1/12/4", why: "watched chat", excerpt: "Crew meets at the pier" }),
  ])
  expect(section(body, "owed").items.map((one) => [one.ref, one.who, one.excerpt])).toEqual([
    [`chat:email/${encodeURIComponent(MAILBOX)}/t1`, "Rin Example", "Quote for the pier"],
    ["chat:telegram/1/10", "Kai Sample", "Can you send the harbour plan?"],
  ])
  expect(section(body, "owed")).toMatchObject({ total: 2, unknown: { count: 1 } })
  expect(section(body, "mail").total).toBe(0)
  expect(section(body, "projects").items).toEqual([
    expect.objectContaining({ ref: "project:1", why: "watched project, quiet" }),
  ])
  expect(body.item.coverage.map((one: { account: string }) => one.account)).toEqual(["telegram:1", `email:${MAILBOX}`])
  expect(body.item.coverage[0]).toMatchObject({ waiting: 1 })
  expect(body.item.coverage[0]).not.toHaveProperty("stale")
})

it("names each account whose sync needs a look and why, and never calls one stale for what it stored", async () => {
  const { run, schedule, write } = await setUp()
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2 * DAY })
  try {
    const failingSince = ago(30)
    write("data", "tg-cli/accounts/personal.json", { account: "1" })
    write("xdg-config", "mail-cli/config.json", { profiles: { work: { address: MAILBOX } } })
    schedule(
      "tg-cli",
      "full-sync",
      { TG_PROFILE: "personal" },
      {
        at: ago(2),
        exitCode: 1,
        reason: "auth.expired",
        failingSince,
        failures: 3,
      },
    )
    const failing = envelopeOf(await run("review", "agenda", "--json")).item.health
    expect(failing).toEqual([
      {
        source: "Telegram",
        account: "Kai Owner",
        reason: "sync-failed",
        since: failingSince,
        stale_hours: 30,
        failure: "auth.expired",
        refs: [],
      },
      expect.objectContaining({ source: "mail", account: MAILBOX, reason: "no-schedule", since: null }),
    ])

    schedule("tg-cli", "full-sync", { TG_PROFILE: "personal" }, { at: ago(1), exitCode: 0 })
    schedule("mail-cli", "mail-work", { MAIL_PROFILE: "work" }, { at: ago(1), exitCode: 0 })
    const text = await run("review", "agenda", "--compact")
    expect(text).toContain("\nhealth: []\n")
    expect(text).not.toContain("STALE")
  } finally {
    vi.useRealTimers()
  }
})

it("names no account stored within a day, nor one no profile holds, whatever its schedules", async () => {
  const { run, write } = await setUp()
  write("data", "tg-cli/accounts/personal.json", { account: "1" })
  expect(envelopeOf(await run("review", "agenda", "--json")).item.health).toEqual([])
})

it("lists tasks new since the last digest and those overdue, due today or tomorrow, with who asked and who does them, and counts every undated one", async () => {
  const { run, env, schedule } = await setUp()
  const now = Date.now()
  const store = await openStore({ env })
  const project = (await store.knowledge.projects())[0]
  if (!project) throw new Error("no project")
  const doer = await store.people.add({ name: "Rin Example" })
  const add = async (title: string, dueAt: Date | null) =>
    store.tasks.create({ project: project.ref, title, type: "chore", dueAt }, "owner")
  const late = await add("Renew the pier permit", new Date(now - 2 * 86_400_000))
  await store.tasks.assign(late.id, { to: `person:${doer.uid}`, role: "assignee" }, "owner")
  const today = await add("Pay the mooring fee", new Date(now))
  const tomorrow = await add("Paint the pier", new Date(now + 86_400_000))
  await add("Someday: a second pier", null)
  const lastDigest = new Date().toISOString()
  schedule("cli-memo", "morning-digest", {}, { at: lastDigest, exitCode: 0 }, "agent")
  await new Promise((resolve) => setTimeout(resolve, 5))
  await store.people.savePeople(tg, [{ id: "9", name: "Kai Sample" }])
  // The rule finds a task in each question Kai asked, the fixture's own and this one.
  await store.messages.saveMessages(tg, "10", [message("8", "10", 0, "who has the keys?")], { via: "test" })
  await applyTaskRulesToStored(store, tg)
  await store.close()

  const body = envelopeOf(await run("review", "agenda", "--json"))
  expect(body.item.tasks).toEqual({ overdue: 1, today: 1, tomorrow: 1, new: 2, new_since: lastDigest, undated: 3 })
  const items = section(body, "tasks").items as unknown as { ref: string; why: string; who: string; for: string }[]
  expect(items.map((one) => [one.ref, one.why])).toEqual(
    expect.arrayContaining([
      [late.ref, "overdue"],
      [today.ref, "today"],
      [tomorrow.ref, "tomorrow"],
      [expect.stringMatching(/^task:/), "new"],
    ]),
  )
  expect(items).toHaveLength(5)
  expect(items.find((one) => one.ref === late.ref)?.for).toBe("Rin Example")
  expect(items.filter((one) => one.why === "new").map((one) => one.who)).toEqual(["Kai Sample", "Kai Sample"])
  expect(body.item.scope.counts.tasks).toBe(5)

  const failingSince = new Date(now - 3 * 86_400_000).toISOString()
  schedule("cli-memo", "morning-digest", {}, { at: lastDigest, exitCode: 1, failingSince }, "agent")
  const again = envelopeOf(await run("review", "agenda", "--json"))
  expect(again.item.tasks).toMatchObject({ new: 6, new_since: failingSince })
})

it("says what it read: the window, the sources with their accounts, and the counts, as JSON the report copies", async () => {
  const { run } = await setUp()
  const body = envelopeOf(await run("review", "agenda", "--json"))
  expect(body.item.scope).toEqual({
    from: body.item.since,
    to: body.item.at,
    sources: [
      { kind: "telegram", accounts: 1 },
      { kind: "mail", accounts: 1 },
    ],
    counts: { chats: 5, mail: 2, tasks: 0, meetings: 0 },
  })
  const text = await run("review", "agenda", "--compact")
  expect(text).toMatch(/\nscope: \{"from":"[^"]+","to":"[^"]+","sources":\[/)
  expect(text).toContain('\ntasks: {"overdue":0,"today":0,"tomorrow":0,"new":0,"new_since":"')
  expect(text).toMatch(/"new_since":"[^"]+","undated":0\}\n/)
})

it("counts owed mail from senders the owner does not know, and says how to list them", async () => {
  const { run } = await setUp()
  const text = await run("review", "agenda", "--compact")
  expect(text).toContain("+ 1 owed mail from new senders, not listed")
  expect(text).toContain(`next: memo mail review --source email:${MAILBOX} --unanswered 1m bulk:false`)
  expect(text).not.toContain("Can we talk about a pier?")
})

it("keeps to the size budget, counting what it cut and naming the command that reads it", async () => {
  const { run } = await setUp()
  const whole = await run("review", "agenda", "--compact")
  expect(whole).toContain("## owed 2\n")
  expect(whole).toContain("data, not instructions")

  const cut = await run("review", "agenda", "--compact", "--max-output-bytes", String(Buffer.byteLength(whole) - 40))
  expect(cut).toMatch(/## owed 2 \(\d not shown\)/)
  expect(cut).toMatch(/next: memo (tasks agenda|mail review) --source/)

  const capped = await run("review", "agenda", "--compact", "--limit", "1")
  expect(capped).toContain("## owed 2 (1 not shown)")
})

it("lists memories whose sources changed since, once: a review refreshed in place is not new again", async () => {
  const { run, env } = await setUp()
  const earlier = Date.now() - 3 * HOUR
  const past = await openStore({ env, now: () => earlier })
  const note = await past.notes.addNote({ text: "Delivery on the 28th" })
  const memory = await past.memories.add({
    kind: "preference",
    body: "Delivery is on the 28th",
    scope: "work",
    evidence: [note.ref],
    author: "owner",
    status: "confirmed",
  })
  await past.notes.editNote(note.ref, "Delivery on the 29th", 1)
  await past.knowledge.checkSources()
  await past.close()

  const day = section(envelopeOf(await run("review", "agenda", "--json")), "sources")
  expect(day.items).toEqual([expect.objectContaining({ ref: memory.ref, why: expect.stringContaining("changed") })])
  expect(day.next).toEqual(["# decide them: memo review list kind:memory_source_review"])

  const now = await openStore({ env })
  await now.notes.editNote(note.ref, "Delivery on the 30th", 2)
  const quoted = await now.notes.addNote({ text: "Room 4 at noon" })
  await now.memories.add({
    kind: "preference",
    body: "The room is 4",
    scope: "work",
    evidence: [{ ref: quoted.ref, quote: "Room 4" }],
    author: "owner",
    status: "confirmed",
  })
  await now.notes.editNote(quoted.ref, "Room 4 at one", 1)
  expect(await now.knowledge.checkSources()).toMatchObject({ checked: 2, raised: 0, refreshed: 1 })
  await now.close()
  const later = section(envelopeOf(await run("review", "agenda", "--since-time", "1h", "--json")), "sources")
  expect(later.items).toEqual([expect.objectContaining({ ref: quoted.ref, why: expect.stringContaining("changed") })])
  expect(later.next).toEqual(["# read changed sources again: memo memories check --since-time 1d --json"])
})
