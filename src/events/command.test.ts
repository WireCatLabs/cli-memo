import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { commandCaller } from "../../test/mcp.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

interface Listed {
  items: { ref: string; title: string; event_type: string; accounts: string[]; description: string }[]
  meta: { accounts: string[]; complete: boolean; window: { since?: string; until?: string } }
}

const DAY = 86_400_000

/** A temp store; each phone account imports one synthetic call from `days` ago through `memo records import`. */
const setUp = async (calls: { account: string; name: string; phone: string; days: number }[]) => {
  const dir = mkdtempSync(join(tmpdir(), "memo-events-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: { present: true } })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  for (const [at, call] of calls.entries()) {
    const header = { schema_version: 1, source: { provider: "phone", account: call.account, batch_id: `b${at}` } }
    const record = {
      key: "c1",
      type: "event",
      external_id: `call-${at}`,
      operation: "upsert",
      fields: {
        kind: "call",
        direction: "in",
        phone: call.phone,
        name: call.name,
        started_at: new Date(Date.now() - call.days * DAY).toISOString(),
        duration: 65,
      },
    }
    const file = join(dir, `calls-${at}.jsonl`)
    writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(record)}\n`)
    await run("records", "import", file, "--account", `phone:${call.account}`, "--json")
  }
  const json = async (...args: string[]) => envelopeOf(await run(...args, "--json"))
  return { env, run, json }
}

it("lists a call imported from a phone with no query, in text and in JSON", async () => {
  const f = await setUp([{ account: "pixel", name: "Synthetic Caller", phone: "+34600000001", days: 2 }])

  const text = await f.run("events", "list")
  expect(text).toContain("calendar accounts read: phone:pixel")
  expect(text).toMatch(/event:1 · .* · call · phone:pixel\/Calls · Synthetic Caller · incoming call/)

  const listed = (await f.json("events", "list")) as Listed
  expect(listed.items).toEqual([
    expect.objectContaining({
      ref: "event:1",
      title: "Synthetic Caller",
      event_type: "call",
      accounts: ["phone:pixel"],
      description: "incoming call",
    }),
  ])
  expect(listed.meta).toMatchObject({ accounts: ["phone:pixel"], complete: true })
  expect(Date.parse(listed.meta.window.since as string)).toBeLessThan(Date.now() - 2 * DAY)

  expect((await f.json("events", "show", "event:1")).item).toMatchObject({
    event_type: "call",
    in: "phone:pixel/Calls",
  })
  expect((await f.json("show", "event:1")).items[0].open.line).toBe("memo events show event:1")
})

it("reads every phone account as one list, and narrows by account, calendar and kind", async () => {
  const f = await setUp([
    { account: "pixel", name: "Synthetic Ana", phone: "+34600000001", days: 1 },
    { account: "work", name: "Synthetic Bo", phone: "+34600000002", days: 3 },
  ])
  const all = (await f.json("events", "list")) as Listed
  expect(all.meta.accounts).toEqual(["phone:pixel", "phone:work"])
  expect(all.items.map(({ title, accounts }) => [title, accounts])).toEqual([
    ["Synthetic Ana", ["phone:pixel"]],
    ["Synthetic Bo", ["phone:work"]],
  ])
  expect(await f.run("events", "list")).toContain("calendar accounts read: phone:pixel, phone:work")

  const work = (await f.json("events", "list", "account:phone:work", "event_type:call")) as Listed
  expect(work.items.map(({ title }) => title)).toEqual(["Synthetic Bo"])
  expect(work.meta.accounts).toEqual(["phone:work"])

  await expect(f.run("events", "list", "calendar:Calls")).rejects.toThrow(/names 2 calendars/)
  const one = (await f.json("events", "list", "account:phone:pixel", "calendar:Calls")) as Listed
  expect(one.items.map(({ title }) => title)).toEqual(["Synthetic Ana"])

  const first = (await f.json("events", "list", "--limit", "1")) as Listed & { page: { has_more: boolean } }
  expect(first.items.map(({ title }) => title)).toEqual(["Synthetic Ana"])
  expect(first.page.has_more).toBe(true)

  expect(((await f.json("events", "list", "event_type:birthday")) as Listed).items).toEqual([])
  expect(((await f.json("events", "list", "starts_at>=2d")) as Listed).items.map(({ title }) => title)).toEqual([
    "Synthetic Ana",
  ])
})

const agent = async (env: NodeJS.ProcessEnv, overrides: string[]) => {
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram, overrides).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  const call = await commandCaller(client)
  return {
    call: async (command: string, args: Record<string, unknown>) => {
      const result = await call(command, args)
      return { ...(result.structuredContent as Record<string, unknown>), isError: result.isError === true } as Record<
        string,
        unknown
      >
    },
    close: () => client.close(),
  }
}

it("lists events to an agent, and refuses events and the titles behind them when the server denies them", async () => {
  const f = await setUp([{ account: "pixel", name: "Synthetic Caller", phone: "+34600000001", days: 2 }])
  const allowed = await agent(f.env, [])
  try {
    expect(await allowed.call("events list", {})).toMatchObject({
      items: [expect.objectContaining({ ref: "event:1" })],
    })
  } finally {
    await allowed.close()
  }

  for (const key of ["events", "events.list"]) {
    const denied = await agent(f.env, [`${key}=deny`])
    try {
      expect(await denied.call("events list", {})).toMatchObject({ isError: true })
      const found = await denied.call("search all", { query: "Synthetic" })
      expect(JSON.stringify(found)).not.toContain("Synthetic Caller")
      expect((found.meta as { issues?: unknown[] }).issues).toContainEqual({
        code: "permission_error",
        source: "events",
      })
    } finally {
      await denied.close()
    }
  }

  for (const key of ["events", "events.show"]) {
    const denied = await agent(f.env, [`${key}=deny`])
    try {
      const shown = await denied.call("show", { ref: ["event:1"] })
      expect(shown).toMatchObject({
        isError: true,
        error: { code: "permission_error", details: { permission: "events.show" } },
      })
      expect(JSON.stringify(shown)).not.toContain("Synthetic Caller")
    } finally {
      await denied.close()
    }
  }
})
