import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { configPath } from "../config.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const telegram = { provider: "telegram", account: "1" }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const message = (id: string, text: string, days: number) => ({
  id,
  chatId: "7",
  senderId: "9",
  senderName: "Rita Example",
  timestamp: daysAgo(days),
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const setUp = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-actions-"))
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(dir, "s.db"),
    XDG_CONFIG_HOME: join(dir, "config"),
  }
  delete base.AI_AGENT
  delete base.CLAUDECODE
  const owner = base
  const agent = { ...base, AI_AGENT: "synthetic-agent_1_agent" }
  const store = await openStore({ env: owner })
  await store.messages.saveMessages(
    telegram,
    "7",
    [
      message("1", "Harbour budget agreed for October", 3),
      message("2", "Ok, I will send the bank tracker", 2),
      message("3", "We need an accountant for Harbour", 1),
    ],
    { via: "history" },
  )
  await store.knowledge.addProject({ name: "Synthetic Port", key: "SYP" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: "1" }, "Harbour")
  await store.close()
  const run = async (env: NodeJS.ProcessEnv, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const evidence = await run(owner, "projects", "evidence", "SYP", "--source", "telegram:1")
  const cite = (id: string) => {
    const item = evidence.items.find((one: { ref: string }) => one.ref.endsWith(`/${id}`))
    return { reference: item.ref, fingerprint: item.fingerprint }
  }
  const file = join(dir, "findings.json")
  writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      key: "run-1",
      extractor: "synthetic",
      findings: [
        {
          id: "budget",
          kind: "fact",
          type: "decision",
          statement: "The October budget is agreed",
          project: "project:1",
          evidence: [cite("1")],
        },
        {
          id: "accountant",
          kind: "task",
          type: "chore",
          title: "Find an accountant",
          reason: "The team says it needs one",
          commitment: "explicit",
          project: "project:1",
          evidence: [cite("3")],
        },
      ],
    }),
  )
  return { dir, owner, agent, run, file }
}

it("lets an agent stage cited findings, shows each with its text and neighbours, and decide them with a reason", async () => {
  const { owner, agent, run, file } = await setUp()
  await expect(run(owner, "projects", "actions", "add", file)).rejects.toThrow("agent's proposals")
  const staged = await run(agent, "projects", "actions", "add", file)
  expect(staged).toMatchObject({ project: "project:1", status: "proposed" })

  const listed = await run(owner, "projects", "actions", "list", "SYP")
  const batch = listed.items.find((one: { kind: string }) => one.kind === "findings")
  expect(batch).toMatchObject({ id: staged.id, status: "proposed", key: "run-1" })
  const budget = batch.findings.find((one: { id: string }) => one.id === "budget")
  expect(budget.evidence[0]).toMatchObject({ state: "unchanged", text: "Harbour budget agreed for October" })
  expect(budget.evidence[0].around.map((one: { text: string }) => one.text)).toContain(
    "Ok, I will send the bank tracker",
  )
  const narrow = await run(
    owner,
    "projects",
    "actions",
    "list",
    "SYP",
    "--limit",
    "1",
    "--page",
    "1",
    "--before-n",
    "0",
    "--after-n",
    "0",
  )
  expect(narrow.items[0].findings[0].evidence[0].around).toEqual([])
  expect((await run(owner, "projects", "actions", "list", "SYP", "--page", "2")).items).toEqual([])
  const brief = await run(owner, "projects", "actions", "list", "SYP", "--brief")
  expect(brief.items[0].findings[0].evidence[0]).toEqual({
    reference: budget.evidence[0].reference,
    state: "unchanged",
  })

  await expect(
    run(agent, "projects", "actions", "confirm", "SYP", staged.id, "budget", "--fingerprint", batch.fingerprint),
  ).rejects.toThrow("--reason")
  const decided = await run(
    agent,
    "projects",
    "actions",
    "confirm",
    "SYP",
    staged.id,
    "budget",
    "--fingerprint",
    batch.fingerprint,
    "--reason",
    "the message says it is agreed",
  )
  expect(decided).toMatchObject({
    status: "reviewed",
    receipt: {
      decision: { by: "agent", bot: "synthetic-agent", reason: "the message says it is agreed" },
      items: [
        { id: "budget", status: "accepted" },
        { id: "accountant", status: "rejected" },
      ],
    },
  })
  expect((await run(owner, "projects", "actions", "list", "SYP")).items).toEqual([])
  const second = await run(agent, "projects", "actions", "add", file.replace("findings.json", "findings.json"))
  expect(second.id).toBe(staged.id)
  expect((await run(owner, "projects", "actions", "list", "SYP", "status:reviewed")).items).toHaveLength(1)
})

it("lets the owner turn agent decisions off, and decides suggested key documents too", async () => {
  const { owner, agent, run } = await setUp()
  mkdirSync(dirname(configPath(owner)), { recursive: true })
  writeFileSync(configPath(owner), JSON.stringify({ agent_decisions: false }))
  const key = await run(
    agent,
    "projects",
    "key-documents",
    "add",
    "SYP",
    "msg:telegram/1/7/2",
    "--reason",
    "the tracker",
  )
  expect(key).toMatchObject({ confirmed: false })
  const listed = await run(owner, "projects", "actions", "list", "SYP")
  const suggestion = listed.items.find((one: { kind: string }) => one.kind === "key_document")
  expect(suggestion).toMatchObject({ id: `key:${key.id}`, reason: "the tracker" })
  expect(suggestion.evidence[0]).toMatchObject({ state: "unchanged", text: "Ok, I will send the bank tracker" })
  await expect(
    run(agent, "projects", "actions", "confirm", "SYP", suggestion.id, "--reason", "it is the tracker"),
  ).rejects.toMatchObject({ details: { reason: "projects.agent-decisions-off" } })
  expect(await run(agent, "projects", "actions", "confirm", "SYP", suggestion.id, "--as-owner")).toMatchObject({
    kind: "key_document",
    confirmed: true,
    decided_by: "owner",
  })
  expect((await run(owner, "projects", "key-documents", "list", "SYP")).items[0]).toMatchObject({ confirmed: true })
})

it("offers the same over MCP, where every decision is the agent's and needs a reason", async () => {
  const { owner, agent, run, file } = await setUp()
  await run(agent, "projects", "actions", "add", file)
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(owner).connect(server)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(transport)
  const listed = await client.callTool({ name: "project_actions_list", arguments: { project: "SYP", brief: true } })
  const item = (listed.structuredContent as { items: { id: string; fingerprint: string }[] }).items[0]
  expect(item).toBeDefined()
  const missing = await client.callTool({
    name: "project_actions_reject",
    arguments: { project: "SYP", id: item?.id, fingerprint: item?.fingerprint },
  })
  expect(missing.isError).toBe(true)
  const rejected = await client.callTool({
    name: "project_actions_reject",
    arguments: { project: "SYP", id: item?.id, fingerprint: item?.fingerprint, reason: "not about the project" },
  })
  expect(rejected.isError).toBeFalsy()
  expect(
    (rejected.structuredContent as { item: { receipt: { decision: { by: string } } } }).item.receipt.decision.by,
  ).toBe("agent")
  await client.close()
})

it("lets the owner reject a whole batch without a reason", async () => {
  const { agent, run, file } = await setUp()
  const staged = await run(agent, "projects", "actions", "add", file)
  const rejected = await run(
    agent,
    "projects",
    "actions",
    "reject",
    "SYP",
    staged.id,
    "--fingerprint",
    staged.fingerprint,
    "--as-owner",
  )
  expect(rejected).toMatchObject({
    decided_by: { type: "person" },
    receipt: { accepted: [], decision: { by: "owner" } },
  })
})
