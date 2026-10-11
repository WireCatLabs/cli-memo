import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { openStore } from "@wirecat/cli-messaging/store"
import { beforeEach, expect, it } from "vitest"
import { AGENT, createMemoServer, MEMO_TOOLS } from "./server.js"

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

    const proposal = await call("actions_propose", {
      kind: "reply",
      reason: "Bob Sample asked twice",
      provider: account.provider,
      payload: { text: "Friday works" },
    })
    expect(proposal.structuredContent).toMatchObject({ status: "proposed", account, payload: { text: "Friday works" } })

    const refused = await call("memories_add", {
      text: "Missing evidence",
      kind: "fact",
      scope: "work",
      evidence: ["note:999"],
    })
    expect(refused).toMatchObject({ isError: true, structuredContent: { error: { code: expect.any(String) } } })

    const log = (await call("agents_log", { agent: AGENT })).structuredContent as {
      items: { tool: string; status: string; actor: { name: string } }[]
    }
    expect(log.items.map(({ tool, status }) => `${tool} ${status}`)).toEqual([
      "memories_add failed",
      "actions_propose ok",
      "memories_add ok",
    ])
    expect(log.items.every(({ actor }) => actor.name === AGENT)).toBe(true)
  } finally {
    await client.close()
  }
})
