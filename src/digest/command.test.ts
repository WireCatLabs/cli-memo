import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { storeMail } from "../../test/mail-store.js"
import { createProgram } from "../program.js"

const HOUR = 3_600_000
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
  const env = { ...process.env, MESSAGING_STORE: join(root, "s.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
  const chats = [
    { id: "10", title: "Kai Sample", kind: "dialog" },
    { id: "11", title: "Answered", kind: "dialog" },
    { id: "12", title: "Harbour crew", kind: "group" },
  ] as const
  await store.chats.saveChats(
    tg,
    chats.map((chat) => ({ ...chat, unreadCount: 0, lastMessageAt: null, participantsCount: 2 })),
  )
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
  return { run }
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
  expect(body.item.coverage[0]).toMatchObject({ waiting: 1, stale: false })
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
