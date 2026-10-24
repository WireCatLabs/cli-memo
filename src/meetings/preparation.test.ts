import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const fixture = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-preparation-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  try {
    const key = { provider: "example", account: "synthetic" }
    const accountId = await store.accounts.saveAccount(key, { name: null })
    const sample = sampleMeeting()
    sample.meeting.accountId = accountId
    sample.meeting.startedAt = Date.parse("2026-10-05T12:00:00Z")
    sample.meeting.endedAt = sample.meeting.startedAt + 1000
    const saved = await store.meetings.saveMeeting(sample)
    const project = await store.knowledge.addProject({ name: "Harbour", key: "HBR" })
    await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Harbours")
    await store.knowledge.linkMeetingProject(key, String(saved.meeting.id), project.id, { by: "owner" })
    await store.accounts.saveAccount({ provider: "example", account: "foreign" }, { name: null })
    await store.accounts.saveAccount({ provider: "email", account: "synthetic" }, { name: null })
    const messages = { provider: "telegram", account: "100" }
    await store.accounts.saveProfile("tg", "synthetic", messages)
    await store.messages.saveMessages(
      messages,
      "7",
      Array.from({ length: 12 }, (_, i) => ({
        id: String(i + 1),
        chatId: "7",
        senderId: "9",
        senderName: null,
        timestamp: `2026-10-10T12:00:${String(i).padStart(2, "0")}Z`,
        editedAt: null,
        text: `Harbour evidence ${i + 1}`,
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      })),
      { via: "test" },
    )
    return env
  } finally {
    await store.close()
  }
}

const flags = [
  "--source",
  "example:synthetic",
  "--since-time",
  "2026-10-18T00:00:00Z",
  "--before-time",
  "2026-10-25T00:00:00Z",
  "--history-since-time",
  "2026-10-01T00:00:00Z",
  "--meetings",
  "5",
  "--cues",
  "10",
  "--context-limit",
  "20",
  "--max-read-bytes",
  "262144",
  "--bytes",
  "65536",
]
const cli = async (env: NodeJS.ProcessEnv, args: string[]) => {
  const streams = captureStreams()
  await createProgram({ env, streams }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

it("prepares stored series evidence without claiming a verified schedule or reading unselected communications", async () => {
  const env = await fixture()
  const command = ["meetings", "prepare", "example-series", ...flags, "--project", "Harbours"]
  const answer = envelopeOf(await cli(env, [...command, "--json"]))
  expect(answer.item.upcoming).toMatchObject({ verified_next: false, kind: "unknown", candidate: null })
  expect(answer.item.upcoming.coverage.missing).toContain("schedule-details")
  expect(answer.item.meetings).toHaveLength(1)
  expect(answer.item.meetings[0].evidence.items[0]).toMatchObject({ text: "Ship the example plan." })
  expect(answer.item.communications).toBeUndefined()
  expect(answer.item.coverage.archive_completeness).toBe("unknown")
  expect(answer.item.project_evidence.project).toBeDefined()
  const text = await cli(env, command)
  expect(text).toContain("Next meeting: unverified")
  expect(text).toContain("Ship the example plan.")
  expect(text).toContain("Communications: not queried")
  const projected = envelopeOf(await cli(env, [...command, "--json=series,meetings,coverage,upcoming"]))
  expect(projected.item.meetings).toHaveLength(1)
  const foreign = envelopeOf(
    await cli(env, ["meetings", "prepare", "example-series", ...flags, "--source", "example:foreign", "--json"]),
  )
  expect(foreign.item.meetings).toEqual([])
})

it("reads only explicit communications grants, carries cursors and refuses malformed or unavailable selections", async () => {
  const env = await fixture()
  const command = [
    "meetings",
    "prepare",
    "example-series",
    ...flags,
    "--context-source",
    "tg.synthetic",
    "--context-query",
    "Harbour",
    "--context-since-time",
    "2026-10-01T00:00:00Z",
    "--context-before-time",
    "2026-10-18T00:00:00Z",
  ]
  const first = envelopeOf(await cli(env, [...command, "--json"]))
  expect(first.item.communications.items).toHaveLength(10)
  expect(first.item.communications.items[0].provider).toBe("telegram")
  const coverage = first.item.communications.coverage.sources[0]
  expect(coverage).toMatchObject({ selection_id: "tg.synthetic", has_more: true, state: "searched" })
  const next = envelopeOf(
    await cli(env, [
      ...command.map((value) => (value === "tg.synthetic" ? `tg.synthetic=${coverage.next_cursor}` : value)),
      "--json",
    ]),
  )
  expect(next.item.communications.items).toHaveLength(2)
  const withMail = envelopeOf(await cli(env, [...command, "--context-source", "email.synthetic", "--json"]))
  expect(withMail.item.communications.coverage.sources[1].source).toMatchObject({
    kind: "mail",
    provider: "email",
    account: "synthetic",
  })
  expect(await cli(env, command)).toContain("Harbour evidence")
  const changedQuery = command.map((value) =>
    value === "tg.synthetic" ? `tg.synthetic=${coverage.next_cursor}` : value === "Harbour" ? "Different" : value,
  )
  await expect(cli(env, [...changedQuery, "--json"])).rejects.toMatchObject({ code: "validation_error" })
  await expect(
    cli(env, ["meetings", "prepare", "example-series", ...flags, "--context-query", "Harbour", "--json"]),
  ).rejects.toMatchObject({ code: "validation_error" })
  await expect(cli(env, [...command, "--context-source", "tg.absent", "--json"])).rejects.toMatchObject({
    code: "validation_error",
  })
  await expect(cli(env, ["meetings", "prepare", "example-series", "--json"])).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("exposes strict MCP preparation and refuses unknown fields before invoking the reader", async () => {
  const env = await fixture()
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(server)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(transport)
  try {
    expect((await client.listTools()).tools.find((tool) => tool.name === "meeting_prepare")?.inputSchema).toMatchObject(
      { additionalProperties: false },
    )
    const args = {
      source: "example:synthetic",
      series_id: "example-series",
      after: "2026-10-18T00:00:00Z",
      history_after: "2026-10-01T00:00:00Z",
    }
    const result = await client.callTool({ name: "meeting_prepare", arguments: args })
    expect(result.isError).not.toBe(true)
    expect(envelopeOf(JSON.stringify(result.structuredContent)).item.meetings).toHaveLength(1)
    for (const unknown of [
      { ...args, account_id: 999 },
      { ...args, communications: { sources: [{ id: "tg.synthetic", extra: true }], query: "Harbour" } },
    ]) {
      const invalid = await client.callTool({ name: "meeting_prepare", arguments: unknown })
      expect(invalid.isError).toBe(true)
      expect(invalid.structuredContent).toMatchObject({ error: { code: "validation_error" } })
      expect(JSON.stringify(invalid.structuredContent)).toContain("param")
    }
  } finally {
    await client.close()
  }
})
