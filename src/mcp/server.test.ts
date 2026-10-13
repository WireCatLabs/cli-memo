import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { openStore } from "@wirecat/cli-messaging/store"
import { beforeEach, expect, it } from "vitest"
import { AGENT, createMemoServer, INSTRUCTIONS, MEMO_TOOLS } from "./server.js"

let env: NodeJS.ProcessEnv
const account = { provider: "example", account: "alice-example" }

beforeEach(async () => {
  env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-mcp-")), "messages.db") }
  const store = await openStore({ env })
  try {
    await store.saveAccount(account, { name: "Alice Example" })
    await store.notes.addNote({ text: "Bob Sample prefers Fridays" })
  } finally {
    await store.close()
  }
})

const connected = async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env).connect(serverSide)
  const client = new Client({ name: "fixture", version: "0" })
  await client.connect(clientSide)
  const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
  return { client, call }
}

it("tells a connecting agent when to save a fact, a memory or an action, within 2048 characters", async () => {
  const { client } = await connected()
  try {
    expect(client.getInstructions()).toBe(INSTRUCTIONS)
    for (const tool of ["facts_add", "memories_add", "actions_add"]) expect(INSTRUCTIONS).toContain(tool)
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(2048)
  } finally {
    await client.close()
  }
})

it("offers the memo tools, saves an agent's memory and proposal as its own, and logs every call", async () => {
  const { client, call } = await connected()
  try {
    expect((await client.listTools()).tools.map(({ name }) => name).sort()).toEqual(Object.keys(MEMO_TOOLS).sort())

    const memory = await call("memories_add", {
      text: "Bob Sample prefers Friday meetings",
      kind: "preference",
      scope: "work",
      evidence: ["note:1"],
    })
    expect(memory.structuredContent).toMatchObject({ status: "proposed", author: { type: "bot" } })

    const proposal = await call("actions_add", {
      kind: "reply",
      reason: "Bob Sample asked twice",
      provider: account.provider,
      payload: { text: "Friday works" },
    })
    expect(proposal.structuredContent).toMatchObject({ status: "proposed", account, payload: { text: "Friday works" } })

    const fact = await call("facts_add", {
      type: "decision",
      statement: "Bob Sample runs the Friday review",
      evidence: ["note:1"],
    })
    expect(fact.structuredContent).toMatchObject({ type: "decision", status: "proposed", author: { type: "bot" } })

    const refused = await call("memories_add", {
      text: "Missing evidence",
      kind: "summary",
      scope: "work",
      evidence: ["note:999"],
    })
    expect(refused).toMatchObject({ isError: true, structuredContent: { error: { code: expect.any(String) } } })

    const log = (await call("agents_log", { agent: AGENT })).structuredContent as {
      items: { tool: string; status: string; actor: { name: string } }[]
    }
    expect(log.items.map(({ tool, status }) => `${tool} ${status}`)).toEqual([
      "memories_add failed",
      "facts_add ok",
      "actions_add ok",
      "memories_add ok",
    ])
    expect((await call("memories_list", { limit: 1 })).structuredContent).toMatchObject({ hasMore: false })
    expect(log.items.every(({ actor }) => actor.name === AGENT)).toBe(true)
  } finally {
    await client.close()
  }
})
it("offers vocabulary discovery and preflight without accepting alias changes", async () => {
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Research Example", key: "RES", scope: "work" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Lab Example")
  await store.knowledge.createTag("onboarding")
  await store.close()
  const { client, call } = await connected()
  try {
    const resolved = await call("vocabulary_show", { name: "Lab Example", kind: "project" })
    expect(resolved.structuredContent).toMatchObject({ ambiguous: false, matches: [{ id: project.id }] })
    expect((await call("vocabulary_check", { name: "on-boarding" })).structuredContent).toMatchObject({
      disposition: "review",
    })
    expect((await call("vocabulary_check", { limit: 1 })).structuredContent).toMatchObject({
      pairs: [],
      complete: true,
      semantic: "not-requested",
    })
    expect((await call("vocabulary_check", { maxComparisons: 100001 })).isError).toBe(true)
    expect(
      (await client.listTools()).tools.some((x) => ["vocabulary_alias_add", "vocabulary_create"].includes(x.name)),
    ).toBe(false)
    const proposed = await call("facts_add", {
      type: "decision",
      statement: "Use a weekly review",
      project: project.ref,
      evidence: ["note:1"],
    })
    expect(proposed.structuredContent).toMatchObject({
      status: "proposed",
      project: project.ref,
      author: { type: "bot" },
    })
  } finally {
    await client.close()
  }
})
it("exposes ready task discovery without offering dependency mutation or claims", async () => {
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Research Example", key: "RES" })
  const first = await store.tasks.create({ project: project.ref, title: "Research draft", type: "chore" }, "owner")
  const second = await store.tasks.create({ project: project.ref, title: "Review draft", type: "chore" }, "owner")
  await store.tasks.linkTask(second.id, first.id, "blocked-by", "owner")
  await store.close()
  const { client, call } = await connected()
  try {
    expect((await call("tasks_status", { task: second.id })).structuredContent).toEqual({
      ready: false,
      blockers: [{ task: first.ref, state: "open" }],
    })
    expect((await call("tasks_list", { project: "RES", ready: true })).structuredContent).toMatchObject({
      items: [{ ref: first.ref, key: first.key }],
      hasMore: false,
    })
    expect((await client.listTools()).tools.some((x) => x.name === "tasks_claim" || x.name === "tasks_link")).toBe(
      false,
    )
  } finally {
    await client.close()
  }
})

it("searches every source the store holds, where tg and max read only their own", async () => {
  const { client, call } = await connected()
  try {
    expect((await call("search_notes", { text: "Fridays", exact: true })).structuredContent).toMatchObject({
      hits: [{ ref: "note:1", line: "Bob Sample prefers Fridays" }],
      hasMore: false,
    })
    const all = (await call("search_all", { text: "Fridays", exact: true, only: ["notes"] })).structuredContent as {
      items: { kind: string; text: string }[]
    }
    expect(all.items).toMatchObject([{ kind: "note", text: expect.stringContaining("Fridays") }])
    expect((await call("search_mail", { text: "invoice" })).structuredContent).toMatchObject({
      error: { code: "not_found" },
    })
    expect((await call("person_context", { person: "Bob Sample" })).structuredContent).toMatchObject({
      error: { code: "validation_error" },
    })
  } finally {
    await client.close()
  }
})
