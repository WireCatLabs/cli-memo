import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"
import { commandCaller } from "../../test/mcp.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

interface Shown {
  items?: { ref: string; title: string | null; open: { line: string | null } }[]
  error?: { code: string; details?: { permission?: string } }
}

/** A temp store with an invoice and a lead the owner wrote at the terminal. Synthetic data only. */
const ownerStore = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-show-gate-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const org = await store.knowledge.addOrganization({ name: "Synthetic Org", kind: "company" })
  await store.close()
  const owner = (...args: string[]) =>
    createProgram({ streams: captureStreams(), env, terminal: { present: true } }).parseAsync([...args, "--json"], {
      from: "user",
    })
  await owner(
    "invoices",
    "add",
    "50000.00",
    "RUB",
    "Rental",
    "--title",
    "ZANZI-902",
    "--kind",
    "receivable",
    "--organization",
    org.ref,
  )
  await owner("leads", "add", "Synthetic lead")
  return env
}

const shown = async (env: NodeJS.ProcessEnv, refs: string[], overrides: string[] = []) => {
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram, overrides).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  try {
    const result = await (await commandCaller(client))("show", { ref: refs })
    return { isError: result.isError === true, ...(result.structuredContent as Shown) }
  } finally {
    await client.close()
  }
}

it("shows an agent an invoice and a lead, and the memo command that opens each", async () => {
  const env = await ownerStore()
  const found = await shown(env, ["invoice:1", "lead:1"])
  expect(found.items?.map((one) => one.open.line)).toEqual(["memo invoices show invoice:1", "memo leads show lead:1"])
  expect(found.items?.[0]?.title).toContain("ZANZI-902")
})

it("refuses memo show of an invoice to a server that denies invoices, and shows the rest", async () => {
  const env = await ownerStore()
  for (const key of ["invoices", "invoices.show"]) {
    const refused = await shown(env, ["lead:1", "invoice:1"], [`${key}=deny`])
    expect(refused).toMatchObject({
      isError: true,
      error: { code: "permission_error", details: { permission: "invoices.show" } },
    })
    expect(JSON.stringify(refused)).not.toContain("ZANZI")
  }
  expect((await shown(env, ["lead:1"], ["invoices=deny"])).items?.map((one) => one.ref)).toEqual(["lead:1"])
})

it("refuses memo show of a lead denied in the config file", async () => {
  const env = await ownerStore()
  updateConfig((config) => ({ ...config, permissions: { leads: "deny" } }), env)
  expect(await shown(env, ["lead:1"])).toMatchObject({
    isError: true,
    error: { code: "permission_error", details: { permission: "leads.show" } },
  })
})

// Many stores and MCP calls in one test: over 5 s on a busy CI runner under coverage, about 1 s here.
it("refuses memo show of a product, contract, subscription, wallet or transaction whose own command is denied", async () => {
  const f = await businessStore("show-gate-business")
  const refOf = async (...args: string[]) => (await f.item(OWNER, ...args)).ref as string
  const wallet = await refOf("wallets", "add", "Main account", "RUB")
  const refs = {
    products: await refOf("products", "add", "ZANZI rental", "100.00", "RUB", "--kind", "service"),
    contracts: await refOf("contracts", "add", "ZANZI agreement", "--kind", "service"),
    subscriptions: await refOf(
      ...[
        "subscriptions",
        "add",
        "ZANZI hosting",
        "990.00",
        "RUB",
        "--kind",
        "payable",
        "--supplier",
        f.client,
        "--period",
        "1-month",
      ],
    ),
    wallets: wallet,
    transactions: await refOf(
      "transactions",
      "add",
      wallet,
      "250.00",
      "--kind",
      "out",
      "--occurred-time",
      "2026-02-01",
    ),
  }
  const opened = await shown(f.env, Object.values(refs))
  expect(opened.items?.map((one) => one.open.line)).toEqual(
    Object.entries(refs).map(([group, ref]) => `memo ${group} show ${ref}`),
  )
  for (const [group, ref] of Object.entries(refs))
    expect(await shown(f.env, [ref], [`${group}=deny`])).toMatchObject({
      isError: true,
      error: { code: "permission_error", details: { permission: `${group}.show` } },
    })
}, 30_000)
