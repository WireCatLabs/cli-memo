import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { answerOf } from "../../test/answer.js"
import { commandCaller } from "../../test/mcp.js"
import { memoIn } from "../../test/memo.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const PERSONAL = { provider: "telegram", account: "1" }
const WORK = { provider: "telegram", account: "2" }

const message = (id: string, text: string) => ({
  id,
  chatId: "7",
  senderId: "9",
  senderName: null,
  timestamp: "2026-10-09T00:00:00Z",
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const refs = (answer: { items: { ref: string }[] }) => answer.items.map((item) => item.ref).sort()

describe("account groups", () => {
  let env: NodeJS.ProcessEnv
  let memo: ReturnType<typeof memoIn>

  beforeEach(async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-groups-"))
    env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
    delete env.MEMO_GROUP
    delete env.MEMO_GROUP_LOCK
    const store = await openStore({ env })
    await store.messages.saveMessages(PERSONAL, "7", [message("1", "Groupsignal at home")], { via: "test" })
    await store.messages.saveMessages(WORK, "7", [message("1", "Groupsignal at work")], { via: "test" })
    await store.accounts.saveAccountGroup("work", ["telegram:2"])
    await store.close()
    memo = memoIn(env)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("lists each group with why each account is in it, and highlights a duplicate", async () => {
    const row = async (group: string) =>
      (await memo("groups", "list")).items.find((one: { group: string }) => one.group === group)
    expect((await row("work")).members).toEqual([expect.objectContaining({ ...WORK, reason: "setting", also_in: [] })])
    expect((await row("personal")).members).toEqual([
      expect.objectContaining({ ...PERSONAL, reason: "in no other group" }),
    ])
    const doubled = await memo("groups", "add", "personal", "telegram:2")
    expect(doubled.duplicates).toEqual([{ member: "telegram:2", groups: ["work", "personal"] }])
    expect(doubled.groups.work[0].also_in).toEqual(["personal"])
    expect((await row("work")).duplicates).toEqual([{ member: "telegram:2", groups: ["work", "personal"] }])
  })

  it("adds, moves and removes a member, and never takes a command word as a group name", async () => {
    const added = await memo("groups", "add", "family", "telegram:1")
    expect(added.groups.family).toEqual([expect.objectContaining(PERSONAL)])
    expect(added.groups.personal).toEqual([])
    const moved = await memo("groups", "move", "telegram:1", "family", "work")
    expect(moved.groups.work.map((one: { account: string }) => one.account).sort()).toEqual(["1", "2"])
    expect(moved.groups.family).toEqual([])
    const removed = await memo("groups", "remove", "work", "telegram:1")
    expect(removed.groups.personal).toEqual([expect.objectContaining(PERSONAL)])
    await expect(memo("groups", "add", "search", "telegram:1")).rejects.toMatchObject({ code: "validation_error" })
  })

  it("reads only the group's accounts after the group word, and refuses an account outside it", async () => {
    expect(refs(await memo("search", "messages", "Groupsignal"))).toEqual(["msg:telegram/1/7/1", "msg:telegram/2/7/1"])
    expect(refs(await memo("work", "search", "messages", "Groupsignal"))).toEqual(["msg:telegram/2/7/1"])
    expect(refs(await memo("work", "search", "all", "Groupsignal", "--exact"))).toEqual(["msg:telegram/2/7/1"])
    expect(refs(await memo("personal", "search", "all", "Groupsignal", "--exact"))).toEqual(["msg:telegram/1/7/1"])
    await expect(memo("work", "messages", "show", "msg:telegram/1/7/1")).rejects.toMatchObject({
      code: "validation_error",
      message: expect.stringContaining("outside"),
    })
    await expect(memo("work", "search", "people", "x", "--source", "telegram:1")).rejects.toMatchObject({
      code: "validation_error",
    })
  })

  it("takes MEMO_GROUP as the group word", async () => {
    const scoped = memoIn({ ...env, MEMO_GROUP: "work" })
    expect(refs(await scoped("search", "messages", "Groupsignal"))).toEqual(["msg:telegram/2/7/1"])
  })

  it("refuses a first word that is neither a command nor a group", async () => {
    await expect(memo("serch", "all", "x")).rejects.toMatchObject({ code: "validation_error" })
    await expect(memo("nogroup", "search", "all", "x")).rejects.toMatchObject({
      code: "validation_error",
      message: expect.stringContaining("neither a command nor a group"),
    })
  })

  it("under MEMO_GROUP_LOCK reads only the group, with or without the word, and refuses everything else", async () => {
    vi.stubEnv("MEMO_GROUP_LOCK", "work")
    const locked = memoIn({ ...env, MEMO_GROUP_LOCK: "work" })
    expect(refs(await locked("search", "messages", "Groupsignal"))).toEqual(["msg:telegram/2/7/1"])
    expect(refs(await locked("search", "all", "Groupsignal", "--exact"))).toEqual(["msg:telegram/2/7/1"])
    for (const args of [
      ["personal", "search", "all", "x"],
      ["messages", "show", "msg:telegram/1/7/1"],
      ["search", "people", "x", "--source", "telegram:1"],
      ["search", "people", "x", "--source", "all"],
      ["groups", "add", "work", "telegram:1"],
    ])
      await expect(locked(...args)).rejects.toMatchObject({ code: "permission_error" })
  })

  it("serves an MCP agent under MEMO_GROUP_LOCK only the group's accounts", async () => {
    vi.stubEnv("MEMO_GROUP_LOCK", "work")
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer({ ...env, MEMO_GROUP_LOCK: "work" }, createProgram).connect(serverSide)
    const client = new Client({ name: "locked", version: "0" })
    await client.connect(clientSide)
    try {
      const call = await commandCaller(client)
      const found = answerOf(
        JSON.stringify((await call("search all", { query: "Groupsignal", exact: true })).structuredContent),
      )
      expect(refs(found)).toEqual(["msg:telegram/2/7/1"])
      expect(await call("messages show", { message: "msg:telegram/1/7/1" })).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "permission_error" } },
      })
      expect(await call("search messages", { query: "Groupsignal in:telegram:1" })).toMatchObject({
        isError: true,
        structuredContent: { error: { message: expect.stringContaining("leave in: out") } },
      })
    } finally {
      await client.close()
    }
  })
})
