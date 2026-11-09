import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { commandCaller } from "../../test/mcp.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

interface Found {
  items?: { kind: string; ref: string }[]
  meta?: { issues?: unknown[] }
  error?: { code: string; reason?: string }
}

/** A temp store holding one invoice the owner wrote at the terminal, numbered ZANZI-901. Synthetic data only. */
const invoiceStore = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-business-gate-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const org = await store.knowledge.addOrganization({ name: "Synthetic Org", kind: "company" })
  await store.close()
  await createProgram({ streams: captureStreams(), env, terminal: { present: true } }).parseAsync(
    ["invoices", "add", "50000.00", "RUB", "Rental", "--title", "ZANZI-901", "--kind", "receivable"].concat([
      "--organization",
      org.ref,
      "--json",
    ]),
    { from: "user" },
  )
  return env
}

const owner = (env: NodeJS.ProcessEnv, ...args: string[]) =>
  createProgram({ streams: captureStreams(), env, terminal: { present: true } }).parseAsync([...args, "--json"], {
    from: "user",
  })

const searched = async (env: NodeJS.ProcessEnv, overrides: string[] = [], extra: Record<string, unknown> = {}) => {
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram, overrides).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  try {
    const call = await commandCaller(client)
    const all = await call("search all", { query: "ZANZI", ...extra })
    return { isError: all.isError === true, ...(all.structuredContent as Found) }
  } finally {
    await client.close()
  }
}

const invoices = (found: Found) => (found.items ?? []).filter((hit) => hit.kind === "invoice")

it("shows an agent the invoice search all finds while its permissions allow invoices list", async () => {
  const env = await invoiceStore()
  expect(invoices(await searched(env)).map((hit) => hit.ref)).toEqual(["invoice:1"])
})

it("keeps from search all the invoices a server denies listing, and says so", async () => {
  const env = await invoiceStore()
  for (const key of ["invoices", "invoices.list"]) {
    const found = await searched(env, [`${key}=deny`])
    expect(found.isError).toBe(false)
    expect(invoices(found)).toEqual([])
    expect(found.meta?.issues).toContainEqual({ code: "permission_error", source: "business" })
  }
})

it("leaves the whole business lane out for business.list=deny, passed or saved in the config file", async () => {
  const env = await invoiceStore()
  const passed = await searched(env, ["business.list=deny"])
  expect(invoices(passed)).toEqual([])
  expect(passed.meta?.issues).toContainEqual({ code: "permission_error", source: "business" })
  updateConfig((config) => ({ ...config, permissions: { "business.list": "deny" } }), env)
  expect(invoices(await searched(env))).toEqual([])
})

it("fills --limit with the hits it may show, reading past the hidden ones", async () => {
  const env = await invoiceStore()
  for (const number of ["ZANZI-11", "ZANZI-12"])
    await owner(env, "orders", "add", "Synthetic Shop", "--title", number, "--kind", "business")
  for (const number of ["ZANZI-21", "ZANZI-22", "ZANZI-23"])
    await owner(
      env,
      "invoices",
      "add",
      "100.00",
      "RUB",
      "Extra",
      "--title",
      number,
      "--kind",
      "payable",
      "--organization",
      "organization:1",
    )
  const found = await searched(env, ["invoices=deny"], { limit: 2 })
  expect(found.items?.map((hit) => hit.kind)).toEqual(["order", "order"])
})

it("searches the business lane alone with --only business, and refuses it when business.list is denied", async () => {
  const env = await invoiceStore()
  expect(invoices(await searched(env, [], { only: ["business"] })).map((hit) => hit.ref)).toEqual(["invoice:1"])
  const denied = await searched(env, ["business.list=deny"], { only: ["business"] })
  expect(denied).toMatchObject({ isError: true, error: { code: "permission_error", reason: "search.all-denied" } })
})

it("keeps from search all the products and contracts a server denies listing", async () => {
  const env = await invoiceStore()
  await owner(env, "products", "add", "ZANZI rental", "100.00", "RUB", "--kind", "service")
  await owner(env, "contracts", "add", "ZANZI agreement", "--kind", "service")
  const kinds = (found: Found) => (found.items ?? []).map((hit) => hit.kind).sort()
  expect(kinds(await searched(env))).toEqual(["contract", "invoice", "product"])
  expect(kinds(await searched(env, ["products=deny", "contracts.list=deny"]))).toEqual(["invoice"])
})
