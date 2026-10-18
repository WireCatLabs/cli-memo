import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const telegram = { provider: "telegram", account: "1" }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const message = (id: string, text: string, timestamp: string) => ({
  id,
  chatId: "7",
  senderId: "9",
  senderName: null,
  timestamp,
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const setUp = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-gather-")), "s.db") }
  const store = await openStore({ env })
  await store.messages.saveMessages(
    telegram,
    "7",
    [
      message("1", "Harbour budget agreed", daysAgo(3)),
      message("2", "Crane tender opens for the harbour", daysAgo(2)),
      message("3", "Lunch with Alice Example", daysAgo(1)),
      message("4", "Harbour kickoff long ago", daysAgo(200)),
    ],
    { via: "test" },
  )
  const project = await store.knowledge.addProject({ name: "Synthetic Port", key: "SYP" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Harbour")
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { env, run, json: async (...args: string[]) => answerOf(await run(...args, "--json")) }
}

it("gathers a project's references by its aliases, keywords and people within 60 days of one account", async () => {
  const { json, run } = await setUp()
  const found = await json(
    "projects",
    "evidence",
    "SYP",
    "--source",
    "telegram:1",
    "--context-query",
    "crane tender",
    "--contact",
    "Alice Example",
  )
  expect(found).toMatchObject({ project_ref: "project:1", scope: { origin: "explicit" }, completeness: "unknown" })
  expect(found.lanes.map((lane: { query: string }) => lane.query)).toEqual([
    "Synthetic Port",
    "Harbour",
    "crane tender",
    "Alice Example",
  ])
  const byRef = Object.fromEntries(found.items.map((item: { ref: string }) => [item.ref, item]))
  expect(Object.keys(byRef).sort()).toEqual(["msg:telegram/1/7/1", "msg:telegram/1/7/2", "msg:telegram/1/7/3"])
  expect(byRef["msg:telegram/1/7/2"]).toMatchObject({ lanes: ["l2", "l3"], context: "project", time_kind: "sent" })
  expect(byRef["msg:telegram/1/7/3"]).toMatchObject({ context: "person-only" })
  expect(found.checkpoint).toBeNull()

  const text = await run("projects", "evidence", "SYP", "--source", "telegram:1", "--since-time", "365d")
  expect(text).toContain("msg:telegram/1/7/4")
  expect(text).toContain("a finished search does not prove there is nothing more")
})

it("resolves a project by id and reads a mailbox and an imported notes folder as their own source kinds", async () => {
  const { env, json } = await setUp()
  const store = await openStore({ env })
  const mailId = await store.accounts.saveAccount({ provider: "email", account: "me@example.com" }, { name: "Me" })
  await store.mail.saveThread({
    accountId: mailId,
    externalId: "t1",
    now: 1,
    emails: [
      {
        externalId: "m1",
        subject: "Harbour offer",
        from: { address: "port@example.com", name: null },
        to: [{ address: "me@example.com", name: null }],
        cc: [],
        sentAt: Date.parse(daysAgo(4)),
        receivedAt: Date.parse(daysAgo(4)),
        references: [],
        bodyText: "Harbour offer attached",
        outgoing: false,
        read: true,
        mailboxes: [{ externalId: "INBOX", name: "INBOX", kind: null }],
      },
    ],
  })
  const folder = await store.notes.addFolder({ name: "Synthetic folder" })
  await store.notes.saveFileNote({ folderId: folder.id, path: "port.md", title: "Harbour", text: "Harbour notes" })
  await store.close()

  for (const reference of ["project:1", "1"]) {
    const found = await json("projects", "evidence", reference, "--source", `email:me@example.com,notes:${folder.id}`)
    expect(found.project_ref).toBe("project:1")
    expect(found.lanes.map((lane: { query: string }) => lane.query)).toEqual(["Synthetic Port", "Harbour"])
    expect(found.scope.sources).toEqual([
      { kind: "mail", account_id: mailId, provider: "email", account: "me@example.com" },
      expect.objectContaining({ kind: "document", account_id: Number(folder.id), provider: "folder" }),
    ])
    expect(found.units.every((unit: { state: string }) => unit.state === "done")).toBe(true)
  }
  await expect(json("projects", "evidence", "project:9", "--source", "telegram:1")).rejects.toMatchObject({
    code: "not_found",
  })
})

it("stops at the read budget and continues from the checkpoint without repeating references", async () => {
  const { json } = await setUp()
  const args = ["projects", "evidence", "Harbour", "--source", "telegram:1", "--context-query", "crane tender"]
  const first = await json(...args, "--max-pages", "1")
  expect(first).toMatchObject({ stopped: "reads", complete: false })
  const capped = await json(...args, "--limit", "1")
  expect(capped).toMatchObject({ stopped: "items", complete: false })
  const second = await json(...args, "--cursor", first.checkpoint)
  expect(second).toMatchObject({ resumed: true, complete: true })
  const seen = new Set(first.items.map((item: { ref: string }) => item.ref))
  expect(second.items.every((item: { ref: string }) => !seen.has(item.ref))).toBe(true)
  await expect(
    json("projects", "evidence", "Harbour", "--source", "telegram:1", "--cursor", first.checkpoint),
  ).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("over MCP needs a source, refuses unknown arguments and reports what all leaves unread", async () => {
  const { env } = await setUp()
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env).connect(server)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(transport)
  const missing = await client.callTool({ name: "project_evidence", arguments: { project: "SYP" } })
  expect(missing.isError).toBe(true)
  const unknown = await client.callTool({
    name: "project_evidence",
    arguments: { project: "SYP", source: "all", keywords: ["crane"] },
  })
  expect(unknown.isError).toBe(true)
  const all = await client.callTool({
    name: "project_evidence",
    arguments: {
      project: "SYP",
      source: "all",
      context_query: ["crane tender"],
      contact: ["Alice Example"],
      since_time: "30d",
    },
  })
  expect(all.isError).toBeFalsy()
  const item = (all.structuredContent as { item: Record<string, unknown> }).item
  expect(item).toMatchObject({ scope: { origin: "all-connected" }, window: { lookback_days: 30 } })
  expect((item.lanes as { query: string }[]).map((lane) => lane.query)).toEqual([
    "Synthetic Port",
    "Harbour",
    "crane tender",
    "Alice Example",
  ])
  expect(item.unread_sources).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "notes" })]))
  await client.close()
})
