import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const CLIENT = { provider: "max", account: "11" }
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const said = (chatId: string, id: number, days: number, outgoing: boolean) => ({
  id: String(id),
  chatId,
  senderId: outgoing ? "1" : "31",
  senderName: outgoing ? "Owner" : "Ana",
  timestamp: ago(days),
  editedAt: null,
  text: `m${id}`,
  outgoing,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const locks: Record<string, string>[] = []

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-activity-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "s.db") }
  const store = await openStore({ env })
  const busy = await store.knowledge.addProject({ name: "Harbour site", key: "HRB" })
  await store.knowledge.addProject({ name: "Quiet one", key: "QTE" })
  for (const [id, title, days] of [
    ["-900", "Harbour group", [1, 2, 40]],
    ["-901", "Muted crew", [1]],
  ] as const) {
    await store.chats.saveChats(CLIENT, [{ id, title, kind: "group", muted: id === "-901" }])
    await store.messages.saveMessages(
      CLIENT,
      id,
      days.map((d, i) => said(id, i + 1, d, i === 1)),
      { via: "test" },
    )
    await store.knowledge.relate(null, {
      by: "owner",
      from: `chat:max/11/${id}`,
      to: busy.ref,
      kind: "member-of",
      confirmed: true,
    })
  }
  await store.chats.saveChats({ provider: "max", account: "22" }, [{ id: "5", title: "Other", kind: "dialog" }])
  await store.close()
  const run = async (args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...locks.at(-1) } })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return Object.assign((...args: string[]) => run(["stats", "projects", "show", ...args]), { run })
}

it("lists every project's linked chats busiest first, muted ones named and not counted", async () => {
  const show = await setUp()
  const body = envelopeOf(await show("--json"))

  expect(body.page).toMatchObject({ has_more: false, total: { value: 2, relation: "eq" } })
  expect(body.items[0]).toMatchObject({
    key: "HRB",
    chats: 2,
    muted: 1,
    messages: 2,
    sent: 1,
    last_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    top: [{ ref: "chat:max/11/-900", title: "Harbour group", messages: 2 }],
  })
  expect(body.items[1]).toMatchObject({ key: "QTE", chats: 0, messages: 0, last_at: null })
})

it("reads all time, pages, and prints one block per project", async () => {
  const show = await setUp()
  expect(envelopeOf(await show("--since-time", "all", "--json")).items[0]).toMatchObject({ messages: 3 })

  const first = envelopeOf(await show("--limit", "1", "--json"))
  expect(first.items).toHaveLength(1)
  expect(first.page).toMatchObject({ has_more: true })
  const second = envelopeOf(await show("--limit", "1", "--page", "2", "--json"))
  expect(second.items.map((one: { key: string }) => one.key)).toEqual(["QTE"])
  expect(second.page).toMatchObject({ has_more: false })

  expect(JSON.stringify(first.next)).toContain("30d")

  const text = await show()
  expect(text).toContain("HRB  Harbour site · 2 chats (1 muted, not counted) · 2 messages (1 yours)")
  expect(text).toContain("  2  Harbour group")
  expect(await show("--since-time", "all")).toMatch(/^all time/)
})

it("runs under a group lock and counts only that group's chats", async () => {
  const show = await setUp()
  await show.run(["groups", "add", "personal", "max:22"])
  locks.push({ MEMO_GROUP_LOCK: "personal" })
  try {
    const body = envelopeOf(await show("--json"))
    expect(body.items[0]).toMatchObject({ chats: 0, messages: 0 })
  } finally {
    locks.pop()
  }
})
