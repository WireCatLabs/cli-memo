import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { type AccountKey, openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { callCommand } from "../../test/mcp.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const CLIENT = { provider: "max", account: "11" }
const CONTRACTOR = { provider: "telegram", account: "22" }
const at = (date: string, time = "09:00") => `${date}T${time}:00.000Z`

const said = (chatId: string, id: number, when: string, from: string, text: string) => ({
  id: String(id),
  chatId,
  senderId: from === "me" ? "1" : from.toLowerCase(),
  senderName: from === "me" ? "Owner" : from,
  timestamp: when,
  editedAt: null,
  text,
  outgoing: from === "me",
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const CHATS = [
  {
    account: CLIENT,
    id: "-900",
    title: "Harbour group",
    kind: "group" as const,
    role: "client",
    whole: true,
    messages: [
      said("-900", 1, at("2026-10-12"), "Ana", "Что с интеграцией 1C? Ждём новостей"),
      said("-900", 2, at("2026-10-14"), "me", "1C подключим, как только закроем счёт"),
      said("-900", 3, at("2026-10-19"), "me", "Напоминаю: оплатите, пожалуйста, счёт на 1 200 € за сентябрь"),
      said("-900", 4, at("2026-10-26"), "me", "Повторно: счёт 1 200 € ждёт оплаты"),
    ],
  },
  {
    account: CONTRACTOR,
    id: "555",
    title: "Lev",
    kind: "dialog" as const,
    role: "contractor",
    whole: false,
    messages: [
      said("555", 10, at("2026-10-20"), "me", "Лев, как там отчёт за сентябрь?"),
      said("555", 12, at("2026-10-28"), "Lev", "Отчёт готов. Когда оплата 300 €?"),
    ],
  },
]

const setUp = async (profiles: Record<string, AccountKey["account"]> = { work: "11" }) => {
  const root = mkdtempSync(join(tmpdir(), "memo-status-"))
  const maxAccounts = join(root, "max-state", "accounts")
  mkdirSync(maxAccounts, { recursive: true })
  for (const [profile, account] of Object.entries(profiles))
    writeFileSync(join(maxAccounts, `${profile}.json`), JSON.stringify({ account }))
  const env = { ...process.env, MESSAGING_STORE: join(root, "s.db"), MAX_STATE_DIR: join(root, "max-state") }
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Harbour site", key: "HRB" })
  for (const chat of CHATS) {
    await store.chats.saveChats(chat.account, [
      { id: chat.id, title: chat.title, kind: chat.kind, unreadCount: 0, lastMessageAt: null, participantsCount: 3 },
    ])
    await store.messages.saveMessages(chat.account, chat.id, chat.messages, { via: "test" })
    const ids = chat.messages.map((one) => Number(one.id))
    await store.sync.markRange(chat.account, chat.id, Math.min(...ids), Math.max(...ids))
    if (chat.whole) await store.sync.setSyncState(chat.account, `history_start:${chat.id}`, String(Math.min(...ids)))
    await store.knowledge.relate(null, {
      by: "owner",
      from: `chat:${chat.account.provider}/${chat.account.account}/${chat.id}`,
      to: project.ref,
      kind: "member-of",
      confirmed: true,
      role: chat.role,
    })
  }
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const status = (...args: string[]) =>
    run("projects", "status", "HRB", "--before-time", "2026-11-02T10:00:00Z", "--context-query", "1C", ...args)
  return { env, status }
}

it("reads every account the links name, says which, and points next at the chats to read", async () => {
  const { status } = await setUp()
  const body = envelopeOf(await status("--json"))
  expect(body.meta).toMatchObject({ complete: false, accounts: ["max/11", "telegram/22"] })
  expect(body.item.money).toEqual([
    { direction: "to_us", currency: "EUR", amount: "1200.00", rows: 1 },
    { direction: "from_us", currency: "EUR", amount: "300.00", rows: 1 },
  ])
  expect(body.item.chats.map((chat: { title: string; role: string }) => [chat.title, chat.role])).toEqual([
    ["Harbour group", "client"],
    ["Lev", "contractor"],
  ])
  expect(body.item.last_message[0]).toMatchObject({ ref: "msg:max/11/-900/4", title: "Owner · 2026-10-26 09:00" })
  expect(body.next).toEqual([
    expect.objectContaining({
      kind: "user_action",
      why: expect.stringContaining(": tg <profile> messages sync 555 --since-time 2026-09-03"),
    }),
    expect.objectContaining({
      kind: "user_action",
      why: expect.stringContaining(': max work messages list --compact -900 "date>=2026-10-19"'),
    }),
  ])
  expect(body.missing).toContainEqual({
    field: "next_command",
    why: "no tg profile here is signed in to account 22; profiles: none",
  })
})

it("prints the status for a person, and one line per row with --compact", async () => {
  const { status } = await setUp()
  const text = await status()
  expect(text).toContain("HRB · Harbour site · 2 linked chats in 2 accounts")
  expect(text).toContain('"1C" quiet on their side since 2026-10-12')
  expect(text).toContain('  2. max work messages list --compact -900 "date>=2026-10-19"')
  const compact = await status("--compact")
  expect(compact).not.toContain("{")
  expect(compact).toContain("msg:max/11/-900/3")
  await expect(status("--compact", "--json")).rejects.toMatchObject({ code: "validation_error" })
})

it("names every profile signed in to a chat's account and picks none", async () => {
  const { status } = await setUp({ work: "11", spare: "11" })
  const body = envelopeOf(await status("--json"))
  expect(body.next[1].why).toContain("max <profile> messages list")
  expect(body.missing).toContainEqual({
    field: "next_command",
    why: "2 max profiles are signed in to account 11: spare, work — choose one with --sync-profile max=<profile>",
  })
  const chosen = envelopeOf(await status("--json", "--sync-profile", "max=spare"))
  expect(chosen.next[1].why).toContain("max spare messages list")
})

it("answers over MCP with the same item", async () => {
  const { env } = await setUp()
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(server)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(transport)
  const result = await callCommand(client, {
    name: "projects status",
    arguments: { project: "HRB", before_time: "2026-11-02T10:00:00Z", context_query: ["1C"] },
  })
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
  const body = result.structuredContent as { item: { key: string }; next: { kind: string; why: string }[] }
  expect(body.item.key).toBe("HRB")
  expect(body.next.map((step) => step.kind)).toEqual(["user_action", "user_action"])
})
