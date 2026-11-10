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

const rowOf = (answer: { items: { group: string; members: unknown[]; duplicates: unknown[] }[] }, group: string) =>
  answer.items.find((one) => one.group === group)

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

  it("lists the saved groups, then all with every account, and highlights a duplicate", async () => {
    const listed = await memo("groups", "list")
    expect(listed.items.map(({ group }: { group: string }) => group)).toEqual(["work", "all"])
    expect(rowOf(listed, "work")?.members).toEqual([expect.objectContaining({ ...WORK, reason: "setting" })])
    expect(
      ((rowOf(listed, "all")?.members ?? []) as { account: string }[]).map(({ account }) => account).sort(),
    ).toEqual(["1", "2"])
    const doubled = await memo("groups", "add", "personal", "telegram:2")
    expect(rowOf(doubled, "personal")?.duplicates).toEqual([{ member: "telegram:2", groups: ["work", "personal"] }])
    expect(rowOf(doubled, "work")?.members).toEqual([expect.objectContaining({ also_in: ["personal"] })])
  })

  it("adds, moves and removes a member, and never takes a command word as a group name", async () => {
    const added = await memo("groups", "add", "family", "telegram:1")
    expect(rowOf(added, "family")?.members).toEqual([expect.objectContaining(PERSONAL)])
    const moved = await memo("groups", "move", "telegram:1", "family", "work")
    expect(((rowOf(moved, "work")?.members ?? []) as { account: string }[]).map((one) => one.account).sort()).toEqual([
      "1",
      "2",
    ])
    expect(rowOf(moved, "family")?.members).toEqual([])
    const removed = await memo("groups", "remove", "work", "telegram:1")
    expect(rowOf(removed, "work")?.members).toEqual([expect.objectContaining(WORK)])
    await expect(memo("groups", "add", "search", "telegram:1")).rejects.toMatchObject({ code: "validation_error" })
    await expect(memo("groups", "add", "all", "telegram:1")).rejects.toMatchObject({ code: "validation_error" })
  })

  it("sets an account's scope and one chat's, and a later list shows the account's", async () => {
    expect(await memo("groups", "update", "telegram:2", "--scope", "work")).toMatchObject({
      ...WORK,
      scope: "work",
    })
    expect(rowOf(await memo("groups", "list"), "work")?.members).toEqual([
      expect.objectContaining({ ...WORK, scope: "work" }),
    ])
    expect(await memo("groups", "update", "telegram:1", "--chat", "7", "--scope", "work")).toEqual({
      ...PERSONAL,
      chat: "7",
      own: "work",
      scope: "work",
    })
    expect(await memo("groups", "update", "telegram:1", "--chat", "7", "--scope", "account")).toMatchObject({
      own: null,
      scope: "personal",
    })
    await expect(memo("groups", "update", "telegram:1", "--scope", "account")).rejects.toMatchObject({
      code: "validation_error",
    })
    await expect(memo("groups", "update", "telegram:1", "--chat", "nowhere", "--scope", "work")).rejects.toMatchObject({
      code: "not_found",
    })
  })

  it("never offers an agent over MCP the scope change", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer(env, createProgram).connect(serverSide)
    const client = new Client({ name: "agent", version: "0" })
    await client.connect(clientSide)
    try {
      const found = await client.callTool({ name: "memo_tools_search", arguments: {} })
      const commands = (found.structuredContent as { items: { command: string }[] }).items.map((one) => one.command)
      expect(commands).toContain("groups move")
      expect(commands).not.toContain("groups update")
    } finally {
      await client.close()
    }
  })

  it("reads only the group's accounts after the group word, every account with all, and refuses an outside --source", async () => {
    expect(refs(await memo("search", "messages", "Groupsignal"))).toEqual(["msg:telegram/1/7/1", "msg:telegram/2/7/1"])
    expect(refs(await memo("all", "search", "messages", "Groupsignal"))).toEqual([
      "msg:telegram/1/7/1",
      "msg:telegram/2/7/1",
    ])
    expect(refs(await memo("work", "search", "messages", "Groupsignal"))).toEqual(["msg:telegram/2/7/1"])
    expect(refs(await memo("work", "search", "all", "Groupsignal", "--exact"))).toEqual(["msg:telegram/2/7/1"])
    await expect(memo("work", "search", "people", "x", "--source", "telegram:1")).rejects.toMatchObject({
      code: "validation_error",
    })
  })

  it("takes MEMO_GROUP as the group word", async () => {
    const scoped = memoIn({ ...env, MEMO_GROUP: "work" })
    expect(refs(await scoped("search", "messages", "Groupsignal"))).toEqual(["msg:telegram/2/7/1"])
  })

  it("refuses a first word that is neither a command nor a group, naming the groups", async () => {
    for (const args of [
      ["serch", "all", "x"],
      ["nogroup", "search", "all", "x"],
    ])
      await expect(memo(...args)).rejects.toMatchObject({
        code: "validation_error",
        message: expect.stringMatching(/unknown command or group — groups here: work/),
      })
    await expect(memo("work")).rejects.toMatchObject({ message: expect.stringContaining("a command follows it") })
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
      ["groups", "update", "telegram:2", "--scope", "personal"],
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

describe("business data in a group", () => {
  it("reads the owner's own in every group, and an import's only where the group holds its account", async () => {
    const { accountsByKind } = await import("./group.js")
    const work = { provider: "sheet", account: "rentals" }
    const outside = { provider: "sheet", account: "home" }
    const scope = {
      run: { name: "work" } as never,
      accounts: [work],
      has: (key: { provider: string; account: string }) =>
        key.provider === work.provider && key.account === work.account,
    }
    expect(accountsByKind(scope, [work, outside]).business).toEqual([
      { provider: "business", account: "internal" },
      work,
    ])
  })
})
