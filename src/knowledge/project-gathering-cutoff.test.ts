import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it, vi } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const END = "2026-10-01T12:00:00.000Z"
const end = Date.parse(END)
const start = end - 60 * 86400000
const source = { provider: "telegram", account: "cutoff-fixture" }
const base = ["projects", "evidence", "HBX", "--source", "telegram:cutoff-fixture", "--before-time", END]
afterEach(() => vi.useRealTimers())

const setup = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-cutoff-")), "s.db") }
  const store = await openStore({ env })
  try {
    await store.knowledge.addProject({ name: "Harbour Boundary", key: "HBX" })
    await store.messages.saveMessages(
      source,
      "7",
      [start - 1, start, end - 1, end, end + 1].map((at, i) => ({
        id: String(i + 1),
        chatId: "7",
        senderId: "9",
        senderName: null,
        text: "Harbour Boundary update",
        timestamp: new Date(at).toISOString(),
        editedAt: null,
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      })),
      { via: "test" },
    )
  } finally {
    await store.close()
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { env, run, json: async (...args: string[]) => answerOf(await run(...args, "--json")) }
}
const refs = (value: { items: { ref: string }[] }) => value.items.map((item) => item.ref).sort()
const expected = ["msg:telegram/cutoff-fixture/7/2", "msg:telegram/cutoff-fixture/7/3"]

it("replays an inclusive start and exclusive end after the wall clock advances", async () => {
  const { run, json } = await setup()
  const initial = await json(...base)
  expect(refs(initial)).toEqual(expected)
  expect(initial.window).toMatchObject({ after: start, before: end, as_of: end, lookback_days: 60 })
  const explicit = await json(...base, "--since-time", new Date(start).toISOString())
  expect(refs(explicit)).toEqual(expected)
  expect(explicit.window).toMatchObject({ after: start, before: end, basis: "explicit" })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"))
  expect(refs(await json(...base))).toEqual(expected)
  expect(await run(...base)).toContain(`as of: ${END} (exclusive end; reuse --before-time to repeat this window)`)
})

it("keeps the cutoff on continuation and refuses a changed cutoff", async () => {
  const { json } = await setup()
  const first = await json(...base, "--max-pages", "1")
  expect(first.checkpoint).toEqual(expect.any(String))
  await expect(
    json(...base, "--before-time", "2026-10-02T12:00:00Z", "--max-pages", "1", "--cursor", first.checkpoint),
  ).rejects.toMatchObject({ code: "validation_error" })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"))
  const resumed = await json(
    ...base,
    "--before-time",
    "2026-10-01T14:00:00+02:00",
    "--max-pages",
    "1",
    "--cursor",
    first.checkpoint,
  )
  expect(resumed.window).toEqual(first.window)
  expect(resumed.checkpoint).toBeNull()
  expect(refs({ items: [...first.items, ...resumed.items] })).toEqual(expected)
})

it("shares the zoned cutoff and field-specific validation across CLI and MCP", async () => {
  const { env, json } = await setup()
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(server)
  const client = new Client({ name: "synthetic-cutoff", version: "1" })
  await client.connect(transport)
  try {
    const args = { project: "HBX", source: "telegram:cutoff-fixture", before_time: "2026-10-01T14:00:00+02:00" }
    const result = await client.callTool({ name: "project_evidence", arguments: args })
    expect(result.isError).toBeFalsy()
    expect(refs((result.structuredContent as { item: Parameters<typeof refs>[0] }).item)).toEqual(expected)
    for (const bad of ["2026-10-01", "2026-10-01T12:00:00", "2026-02-30T12:00:00Z"]) {
      await expect(json(...base, "--before-time", bad)).rejects.toMatchObject({
        code: "validation_error",
        details: { param: "before_time" },
      })
      expect(
        await client.callTool({ name: "project_evidence", arguments: { ...args, before_time: bad } }),
      ).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "validation_error", param: "before_time" } },
      })
    }
    expect(await client.callTool({ name: "project_evidence", arguments: { ...args, since_time: END } })).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "validation_error", param: "before_time" } },
    })
    expect(await client.callTool({ name: "project_evidence", arguments: { ...args, asOf: END } })).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "validation_error", param: "asOf" } },
    })
  } finally {
    await client.close()
  }
})

it("names the zone a start date was read in and gives the window in UTC, in the CLI and over MCP", async () => {
  const zone = process.env.TZ
  process.env.TZ = "Asia/Vladivostok"
  try {
    const { env, run } = await setup()
    const window = { since: "2026-08-31T14:00:00.000Z", until: END }
    const cli = envelopeOf(await run(...base, "--since-time", "2026-09-01", "--json"))
    expect(cli.meta).toMatchObject({ timezone: "Asia/Vladivostok", window })
    const days = envelopeOf(await run(...base, "--json"))
    expect(days.meta.timezone).toBeUndefined()
    expect(days.meta.window).toEqual({ since: new Date(start).toISOString(), until: END })

    const [server, transport] = InMemoryTransport.createLinkedPair()
    await createMemoServer(env, createProgram).connect(server)
    const client = new Client({ name: "synthetic-window", version: "1" })
    await client.connect(transport)
    try {
      const args = { project: "HBX", source: "telegram:cutoff-fixture", before_time: END, since_time: "2026-09-01" }
      const result = await client.callTool({ name: "project_evidence", arguments: args })
      expect((result.structuredContent as { meta: object }).meta).toMatchObject({
        timezone: "Asia/Vladivostok",
        window,
      })
    } finally {
      await client.close()
    }
  } finally {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  }
})
