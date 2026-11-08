import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { expect, it } from "vitest"
import { businessStore } from "../../test/business.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

interface Listed {
  command: string
  writes: boolean
  availability: { available: boolean; permission?: string }
}

it("keeps wallets update, which sets the opening balance, from an MCP client, and gates records check as a write", async () => {
  const f = await businessStore("mcp-business")
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(f.env, createProgram).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  try {
    const found = await client.callTool({ name: "memo_tools_search", arguments: {} })
    const items = (found.structuredContent as { items: Listed[] }).items
    const one = (command: string) => items.find((item) => item.command === command)
    expect(one("wallets update")?.availability).toMatchObject({ available: false, permission: "wallets.update" })
    expect(one("wallets add")?.availability.available).toBe(true)
    expect(one("records check")).toMatchObject({ writes: true })
  } finally {
    await client.close()
  }
})
