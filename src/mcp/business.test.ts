import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { expect, it } from "vitest"
import { businessStore } from "../../test/business.js"
import { commandCaller } from "../../test/mcp.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

interface Listed {
  command: string
  writes: boolean
  availability: { available: boolean; permission?: string }
}

interface Answer {
  isError: boolean
  item: { ref: string; sources: { records: { items: unknown[] } } }
  items: { ref: string; kind: string; open: { line: string } }[]
  meta: { issues?: unknown[] }
  error?: { code: string; reason?: string }
}

const EXAMPLE = readFileSync(
  createRequire(import.meta.url).resolve("@wirecat/cli-core/schemas/examples/records-business.jsonl"),
  "utf8",
)

const connected = async (env: NodeJS.ProcessEnv, overrides: string[] = []) => {
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram, overrides).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  const call = await commandCaller(client)
  const answer = async (command: string, args: Record<string, unknown>) => {
    const result = await call(command, args)
    return { isError: result.isError === true, ...(result.structuredContent as Omit<Answer, "isError">) }
  }
  return { client, answer }
}

it("keeps wallets update, which sets the opening balance, from an MCP client, and gates records check as a write", async () => {
  const f = await businessStore("mcp-business")
  const { client } = await connected(f.env)
  try {
    const found = await client.callTool({ name: "memo_tools_search", arguments: {} })
    const items = (found.structuredContent as { items: Listed[] }).items
    const one = (command: string) => items.find((item) => item.command === command)
    expect(one("wallets update")?.availability).toMatchObject({ available: false, permission: "wallets.update" })
    expect(one("wallets add")?.availability.available).toBe(true)
    expect(one("records check")).toMatchObject({ writes: true })
    expect(one("records delete")).toMatchObject({ writes: true, availability: { available: true } })
    expect(one("records link")).toBeUndefined()
  } finally {
    await client.close()
  }
})

it("shows imported business data and its source records to an agent, and finds it in search all", async () => {
  const f = await businessStore("mcp-business-read")
  await f.piped(EXAMPLE, "records", "import", "-", "--account", "example-erp:demo")
  const { client, answer } = await connected(f.env)
  try {
    const shown = await answer("show", { ref: ["contract:1", "invoice:1"] })
    expect(shown.items.map((one) => one.open.line)).toEqual([
      "memo contracts show contract:1",
      "memo invoices show invoice:1",
    ])
    const contract = await answer("contracts show", { contract: "contract:1" })
    expect(contract.item.sources.records.items).toEqual([{ record: "contract:K-2026-14", account: "example-erp:demo" }])
    const all = await answer("search all", { query: "Rental", only: ["business"] })
    expect(all.items.map((hit) => hit.ref)).toContain("contract:1")
  } finally {
    await client.close()
  }
})

it("leaves the business lane out of search all for a server that denies business.list, and says so", async () => {
  const f = await businessStore("mcp-business-denied")
  await f.piped(EXAMPLE, "records", "import", "-", "--account", "example-erp:demo")
  const { client, answer } = await connected(f.env, ["business.list=deny"])
  try {
    const all = await answer("search all", { query: "Rental" })
    expect(all.isError).toBe(false)
    expect(all.items.filter((hit) => hit.kind !== "deal" && hit.kind !== "lead")).toEqual([])
    expect(all.meta.issues).toContainEqual({ code: "permission_error", source: "business" })
    const only = await answer("search all", { query: "Rental", only: ["business"] })
    expect(only).toMatchObject({ isError: true, error: { code: "permission_error", reason: "search.all-denied" } })
  } finally {
    await client.close()
  }
})

it("takes business.list from the config file, and memo doctor does not call it unknown", async () => {
  const f = await businessStore("mcp-business-saved")
  await f.piped(EXAMPLE, "records", "import", "-", "--account", "example-erp:demo")
  updateConfig((config) => ({ ...config, permissions: { "business.list": "deny" } }), f.env)
  const doctor = await f.item({}, "doctor")
  expect(JSON.stringify(doctor)).not.toContain("business.list")
  const { client, answer } = await connected(f.env)
  try {
    const all = await answer("search all", { query: "Rental" })
    expect(all.meta.issues).toContainEqual({ code: "permission_error", source: "business" })
  } finally {
    await client.close()
  }
})

it("gives no sources to an agent denied records show, passed or saved, and still shows the entry", async () => {
  const f = await businessStore("mcp-business-records-denied")
  await f.piped(EXAMPLE, "records", "import", "-", "--account", "example-erp:demo")
  const read = async (overrides: string[]) => {
    const { client, answer } = await connected(f.env, overrides)
    try {
      return {
        shown: await answer("show", { ref: ["contract:1"] }),
        contract: await answer("contracts show", { contract: "contract:1" }),
      }
    } finally {
      await client.close()
    }
  }
  for (const found of [await read(["records.show=deny"]), await read(["records=deny"])]) {
    expect(found.shown.items[0]).not.toHaveProperty("sources")
    expect(found.contract.item).not.toHaveProperty("sources")
    expect(found.contract.item).toHaveProperty("ref", "contract:1")
  }
  updateConfig((config) => ({ ...config, permissions: { "records.show": "deny" } }), f.env)
  const saved = await read([])
  expect(saved.shown.items[0]).not.toHaveProperty("sources")
  expect(saved.contract.item).not.toHaveProperty("sources")
})
