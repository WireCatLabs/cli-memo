import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

// The phrases the CRM relationships scenario (cli-testing performance/crm/relationships) asks memo_tools_search: a
// short one an agent types as a command, and a task in the agent's own words.
const PHRASES: [string, string, string][] = [
  ["organizations context", "organization context", "a client company's people, deals and money"],
  ["deals context", "deal context", "everything about one deal: people, stages, invoices"],
  ["leads context", "lead context", "one lead with its people and history"],
  ["deals update", "deal project", "set the project a deal belongs to"],
  ["relationships list", "relationships", "who reports to whom"],
  ["relationships add", "add relationship", "record that a person reports to another"],
  ["relationships end", "end relationship", "say a relationship ended"],
  ["organizations list", "organizations", "list client organizations"],
  ["context", "person context", "one person's companies and deals"],
  ["groups list", "account groups", "which accounts are in the work group"],
  ["groups add", "add account to group", "put an account in a group"],
  ["groups remove", "remove account group", "take an account out of a group"],
  ["groups move", "move account groups", "move an account to another group"],
]

describe("memo_tools_search finds a command from a task phrase", () => {
  let client: Client
  beforeAll(async () => {
    const [server, transport] = InMemoryTransport.createLinkedPair()
    await createMemoServer(process.env, createProgram).connect(server)
    client = new Client({ name: "synthetic-agent", version: "1" })
    await client.connect(transport)
  })
  afterAll(() => client.close())

  const found = async (query: string) => {
    const answer = await client.callTool({ name: "memo_tools_search", arguments: { query } })
    return (answer.structuredContent as { items: { command: string }[] }).items.map(({ command }) => command)
  }

  it.each(PHRASES)("%s, by its short phrase and by its task, in the 8 it shows", async (command, short, task) => {
    expect(await found(short)).toContain(command)
    expect(await found(task)).toContain(command)
  })
})
