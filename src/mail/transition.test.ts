import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatLocator } from "@wirecat/cli-core"
import { searchStore } from "@wirecat/cli-core/services"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, describe, expect, it } from "vitest"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import { himalayaSource } from "./source.js"

const ME = "owner@example.test"
const KEY = { provider: "email", account: ME }
const opened: MessageStore[] = []
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close()
})

const listed = (n: number) => ({
  uid: String(100 + n),
  messageId: String(9000 + n),
  threadId: String(9000 + n),
  receivedAt: `2026-09-1${n}T08:00:00Z`,
  subject: `Synthetic budget ${n}`,
  from: ["Rin Example", "rin@example.test"],
  to: [[null, ME]],
  text: `Synthetic body ${n}`,
})

/** What `memo mail import` 0.7.0 wrote: a chat per thread, a message per mail, an attachment as its own message. */
const importedAsMessages = async (store: MessageStore, n: number, child = false) => {
  const id = String(9000 + n)
  await store.saveAccount(KEY, { name: ME })
  await store.applyDelta(KEY, {
    chats: [
      {
        id,
        title: `Synthetic budget ${n}`,
        kind: "dialog",
        unreadCount: null,
        lastMessageAt: `2026-09-1${n}T08:00:00Z`,
        participantsCount: 2,
      },
    ],
    people: [{ id: "rin@example.test", name: "Rin Example" }],
    members: new Map([[id, ["rin@example.test", ME]]]),
  })
  const message = {
    id,
    chatId: id,
    senderId: "rin@example.test",
    senderName: "Rin Example",
    timestamp: `2026-09-1${n}T08:00:00Z`,
    editedAt: null,
    text: `Synthetic budget ${n}\n\nSynthetic body ${n}`,
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }
  const children = child ? [{ ...message, id: `${id}:attachment:2`, text: "budget.csv\n\nSynthetic,123" }] : []
  await store.saveMessages(KEY, id, [message, ...children], { via: "himalaya" })
  await store.setSyncState(KEY, `mail_message_folders:${id}`, JSON.stringify(["[Gmail]/All Mail"]))
  await store.setSyncState(KEY, `mail_attachments:${id}`, JSON.stringify(children.map(({ id }) => id)))
}

describe("moving mail from messages into the mail tables", () => {
  it("reads older mail into the mail tables, lists it once, keeps its tags and drops both copies when deleted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memo-mail-move-"))
    const mailbox = join(dir, "mailbox.json")
    const write = (n: number[]) => writeFileSync(mailbox, JSON.stringify({ messages: n.map(listed) }))
    const env = { ...process.env, MEMO_FAKE_MAILBOX: mailbox, MESSAGING_STORE: join(dir, "messages.db") }
    const store = await openStore({ env })
    opened.push(store)
    await importedAsMessages(store, 1)
    await importedAsMessages(store, 2, true)
    await store.addTags(KEY, { type: "message", chatId: "9001", messageId: "9001" }, ["finance"])
    const run = () =>
      importMail({
        store,
        source: himalayaSource(himalaya(env), { name: "test" }),
        account: { name: "test", address: ME },
        since: new Date("2026-09-01T00:00:00Z"),
        now: () => Date.parse("2026-10-04T12:00:00Z"),
      })
    const found = async (text: string) =>
      (await searchStore(store, KEY, { text, kind: "mail", limit: 10 })).items.map(({ locator }) => locator)

    write([1, 2])
    expect(await run()).toMatchObject({ saved: 2, alreadyStored: 0, deleted: 0 })
    expect(await store.message(KEY, "9001", { chatId: "9001" })).toBeDefined()
    // The older attachment entry has its own locator, so it stays listed until the older rows are removed.
    expect((await found("synthetic")).sort()).toEqual([
      formatLocator({ ...KEY, chat: "9001", message: "9001" }),
      formatLocator({ ...KEY, chat: "9002", message: "9002" }),
      formatLocator({ ...KEY, chat: "9002", message: "9002:attachment:2" }),
    ])
    expect(await found("tag:finance")).toEqual([formatLocator({ ...KEY, chat: "9001", message: "9001" })])
    expect(await run()).toMatchObject({ saved: 0, alreadyStored: 2, deleted: 0 })

    write([1])
    // Rows: the email, its older message and the older attachment entry.
    expect((await run()).deleted).toBe(3)
    const { id } = await store.storedAccount(KEY)
    expect(await store.mail.email(id, "9002")).toMatchObject({ bodyText: null })
    expect(await store.message(KEY, "9002", { chatId: "9002" })).toBeUndefined()
    expect(await found("synthetic")).toEqual([formatLocator({ ...KEY, chat: "9001", message: "9001" })])
  })
})
