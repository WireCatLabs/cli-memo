import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const fixture = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-meeting-evidence-")), "s.db") }
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Synthetic Port", key: "SYP" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Harbour")
  const accounts: number[] = []
  const references: string[] = []
  for (const account of ["ExampleCalendar", "OtherCalendar"]) {
    const key = { provider: "zoom", account }
    const id = await store.accounts.saveAccount(key, { name: account })
    accounts.push(id)
    await store.accounts.saveProfile("zm", account, key)
    const input = sampleMeeting()
    input.meeting.accountId = id
    input.meeting.startedAt = Date.now() - 3 * 86400000
    input.transcripts[0].rows[0].text = "Harbour launch reviewed"
    const saved = await store.meetings.saveMeeting(input)
    await store.meetings.indexSearch({ accountId: id, limit: 1000 })
    const {
      items: [transcript],
    } = await store.meetings.transcripts({ accountId: id, meetingId: saved.meeting.id, limit: 1 })
    if (!transcript) throw new Error("Missing synthetic transcript")
    references.push(`meeting:${id}/${saved.meeting.id}/${transcript.id}/0`)
  }
  await store.close()
  const json = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  return { env, json, accounts, references }
}

it("reads only the selected meeting profile and preserves exact cue references on CLI and MCP", async () => {
  const f = await fixture()
  const found = await f.json("projects", "evidence", "SYP", "--source", "zm:ExampleCalendar")
  expect(found.items).toHaveLength(1)
  expect(found.items[0]).toMatchObject({
    ref: f.references[0],
    kind: "meeting",
    time_kind: "meeting-start",
    text: "Harbour launch reviewed",
  })
  expect(found.scope.sources).toEqual([
    { kind: "meeting", account_id: f.accounts[0], provider: "zoom", account: "ExampleCalendar" },
  ])
  expect(found.completeness).toBe("unknown")
  expect(found.unread_sources).toEqual([])
  const [transport, peer] = InMemoryTransport.createLinkedPair()
  await createMemoServer(f.env, createProgram).connect(transport)
  const client = new Client({ name: "synthetic-meeting-evidence", version: "1" })
  await client.connect(peer)
  try {
    const result = await client.callTool({
      name: "project_evidence",
      arguments: { project: "SYP", source: "zm:ExampleCalendar" },
    })
    expect(result.isError).toBeFalsy()
    const payload = (result.structuredContent as { item: { items: { ref: string }[] } }).item
    expect(payload.items.map((item) => item.ref)).toEqual([f.references[0]])
  } finally {
    await client.close()
  }
  const all = await f.json("projects", "evidence", "SYP", "--source", "all")
  expect(all.items.map((item: { ref: string }) => item.ref).sort()).toEqual([...f.references].sort())
  expect(all.unread_sources).not.toContainEqual(expect.objectContaining({ kind: "meetings" }))
})

it("reports pending transcript indexes until the meeting indexing workflow runs", async () => {
  const f = await fixture()
  const store = await openStore({ env: f.env })
  const input = sampleMeeting()
  input.meeting.accountId = f.accounts[0] ?? 0
  input.meeting.externalId = "newer-synthetic-occurrence"
  input.meeting.startedAt = Date.now() - 86400000
  input.transcripts[0].rows[0].text = "Harbour new evidence"
  await store.meetings.saveMeeting(input)
  await store.close()
  const before = await f.json("projects", "evidence", "SYP", "--source", "zm:ExampleCalendar", "--no-catch-up")
  expect(before.items).toHaveLength(1)
  expect(before.units).toContainEqual(expect.objectContaining({ issue: "index-pending" }))
  const streams = captureStreams()
  await createProgram({ streams, env: f.env })
    .exitOverride()
    .parseAsync(["projects", "evidence", "SYP", "--source", "zm:ExampleCalendar", "--no-catch-up"], { from: "user" })
  const text = streams.stdout.join("")
  expect(text).toContain("meeting provider's indexing workflow")
  expect(text).not.toContain("leave out --no-catch-up")
  await f.json("search", "meetings", "Harbour", "--source", "zm:ExampleCalendar")
  const after = await f.json("projects", "evidence", "SYP", "--source", "zm:ExampleCalendar")
  expect(after.items).toHaveLength(2)
  expect(after.units.every((unit: { issue: string | null }) => unit.issue === null)).toBe(true)
})
