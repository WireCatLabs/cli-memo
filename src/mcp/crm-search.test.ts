import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { commandCaller } from "../../test/mcp.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

interface Answer {
  isError: boolean
  items: { ref: string; kind: string }[]
  meta: { issues?: unknown[] }
  error?: { code: string; reason?: string }
}

const crmStore = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-crm-search-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const run = async (...args: string[]) =>
    createProgram({ streams: captureStreams(), env, terminal: { present: false } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
  await run("pipelines", "add", "Sales", "Call", "won", "lost")
  await run("deals", "add", "Rental fleet", "Call", "1000", "EUR")
  await run("leads", "add", "Rental fleet inquiry")
  return env
}

const connected = async (env: NodeJS.ProcessEnv, overrides: string[]) => {
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram, overrides).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  const call = await commandCaller(client)
  const answer = async (args: Record<string, unknown>) => {
    const result = await call("search all", args)
    return { isError: result.isError === true, ...(result.structuredContent as Omit<Answer, "isError">) }
  }
  return { client, answer }
}

it("finds deals and leads in search all for an MCP client allowed to list them", async () => {
  const { client, answer } = await connected(await crmStore(), [])
  try {
    const all = await answer({ query: "Rental" })
    expect(all.items.map((hit) => hit.kind).sort()).toEqual(["deal", "lead"])
    const only = await answer({ query: "Rental", only: ["crm"] })
    expect(only.error).toBeUndefined()
    expect(only.items.map((hit) => hit.kind).sort()).toEqual(["deal", "lead"])
  } finally {
    await client.close()
  }
})

it("leaves deals out of search all for a server that denies deals or deals.list, and says so", async () => {
  const env = await crmStore()
  for (const key of ["deals", "deals.list"]) {
    const { client, answer } = await connected(env, [`${key}=deny`])
    try {
      const all = await answer({ query: "Rental" })
      expect(all.isError).toBe(false)
      expect(all.items.map((hit) => hit.kind)).toEqual(["lead"])
      expect(all.meta.issues).toContainEqual({ code: "permission_error", source: "crm" })
    } finally {
      await client.close()
    }
  }
})

it("leaves the CRM lane out for crm.list or both lists denied, and refuses --only crm", async () => {
  const env = await crmStore()
  for (const overrides of [["crm.list=deny"], ["deals.list=deny", "leads.list=deny"]]) {
    const { client, answer } = await connected(env, overrides)
    try {
      const all = await answer({ query: "Rental" })
      expect(all.isError).toBe(false)
      expect(all.items).toEqual([])
      expect(all.meta.issues).toContainEqual({ code: "permission_error", source: "crm" })
      const only = await answer({ query: "Rental", only: ["crm"] })
      expect(only).toMatchObject({ isError: true, error: { code: "permission_error", reason: "search.all-denied" } })
    } finally {
      await client.close()
    }
  }
})
