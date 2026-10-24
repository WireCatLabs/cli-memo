import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { callCommand, commandSchema } from "../../test/mcp.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const fixture = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-meeting-review-"))
  const env = { ...process.env, AI_AGENT: "", CLAUDECODE: "", MESSAGING_STORE: join(dir, "store.db") }
  const account = { provider: "example", account: "synthetic" }
  const other = { provider: "example", account: "foreign" }
  const store = await openStore({ env })
  try {
    const accountId = await store.accounts.saveAccount(account, { name: "Synthetic" })
    const otherId = await store.accounts.saveAccount(other, { name: "Foreign" })
    const sample = sampleMeeting()
    sample.meeting.accountId = accountId
    sample.meeting.startedAt = Date.parse("2026-10-05T12:00:00Z")
    sample.transcripts[0].rows.push({
      ...sample.transcripts[0].rows[0],
      position: 1,
      startMs: 1000,
      endMs: 2000,
      speakerParticipantPosition: null,
      speakerName: null,
      text: "Ship the draft next week.",
    })
    const saved = await store.meetings.saveMeeting(sample)
    const foreign = sampleMeeting()
    foreign.meeting.accountId = otherId
    await store.meetings.saveMeeting(foreign)
    const project = await store.knowledge.addProject({ name: "Harbour Observatory", key: "HOB" })
    await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Observatory")
    await store.knowledge.linkMeetingProject(account, String(saved.meeting.id), project.id, { by: "owner" })
    await store.knowledge.createTag("finance", { kind: "topic" })
    await store.knowledge.createTag("review")
    await store.knowledge.addTags(account, { type: "meeting", id: String(saved.meeting.id) }, ["finance"])
    const context = await store.meetings.preparationContext({
      accountId,
      meetingId: saved.meeting.id,
      seriesId: saved.meeting.meetingSeriesId as number,
      updatedAt: saved.meeting.updatedAt,
    })
    const person = context.participants.items[0]?.personUid
    return { env, dir, account, saved, project, person, source: "example:synthetic" }
  } finally {
    await store.close()
  }
}
const cli = async (env: NodeJS.ProcessEnv, args: string[]) => {
  const streams = captureStreams()
  await createProgram({ env, streams })
    .exitOverride()
    .parseAsync([...args, ...(args.some((x) => x.startsWith("--json")) ? [] : ["--json"])], { from: "user" })
  const raw = streams.stdout.join("")
  return envelopeOf(raw)
}

it("searches project aliases, keeps scoped continuations and stages findings from the returned passage", async () => {
  const f = await fixture()
  const flags = [
    "--source",
    f.source,
    "--project",
    "Observatory",
    "--since-time",
    "2026-10-01",
    "--until-time",
    "2026-10-31",
    "--max-read-bytes",
    "65536",
    "--limit",
    "1",
  ]
  const hits = await cli(f.env, ["search", "meetings", "Ship", ...flags])
  expect(hits.items).toHaveLength(1)
  expect(hits.meta.accounts).toEqual([f.source])
  expect(hits.meta.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  expect(hits.meta.window).toEqual({
    since: new Date(2026, 9, 1).toISOString(),
    until: new Date(2026, 9, 31, 23, 59, 59, 999).toISOString(),
  })
  expect(hits.missing).toContainEqual(expect.objectContaining({ field: "archive_completeness" }))
  expect(hits.next[0].args.source).toBe(f.source)
  const continued = await cli(f.env, ["search", "meetings", "Ship", ...flags, "--cursor", hits.page.next_cursor])
  expect(continued.items[0].ref).not.toBe(hits.items[0].ref)
  const hit = hits.items[0]
  const passage = await cli(f.env, [
    "meetings",
    "passage",
    hit.ref,
    "--source",
    f.source,
    "--before-n",
    "1",
    "--after-n",
    "1",
    "--bytes",
    "65536",
    "--max-read-bytes",
    "65536",
    "--format",
    "markdown",
  ])
  expect(passage.item.items).toHaveLength(2)
  expect(passage.item.items.some((cue: { speaker_name: string | null }) => cue.speaker_name === null)).toBe(true)
  const checked = await cli(f.env, [
    "meetings",
    "passage",
    hit.ref,
    "--source",
    f.source,
    "--expected-fingerprint",
    passage.item.target_fingerprint,
    "--json=target_ref,target_fingerprint,items.ref,items.fingerprint",
  ])
  expect(checked.item.target_ref).toBe(hit.ref)
  const input = {
    schema_version: 1,
    key: "review-workflow",
    extractor: "synthetic",
    findings: [
      {
        id: "decision",
        kind: "fact",
        type: "decision",
        statement: "Ship the plan",
        project: f.project.ref,
        evidence: [{ reference: hit.ref, fingerprint: passage.item.target_fingerprint }],
      },
    ],
  }
  const file = join(f.dir, "findings.json")
  writeFileSync(file, JSON.stringify(input))
  const staged = await cli({ ...f.env, AI_AGENT: "synthetic-agent" }, [
    "meetings",
    "actions",
    "add",
    file,
    "--account",
    f.source,
  ])
  expect(staged.item).toMatchObject({ status: "proposed", receipt: null })
})

it("refuses missing/ambiguous source selection, foreign cues and foreign cursors", async () => {
  const f = await fixture()
  await expect(cli(f.env, ["search", "meetings", "Ship"])).rejects.toMatchObject({ code: "validation_error" })
  await expect(cli(f.env, ["search", "meetings", "Ship", "--source", "example"])).rejects.toMatchObject({
    code: "validation_error",
  })
  const page = await cli(f.env, ["search", "meetings", "Ship", "--source", f.source, "--limit", "1"])
  await expect(
    cli(f.env, ["meetings", "passage", page.items[0].ref, "--source", "example:foreign"]),
  ).rejects.toMatchObject({ code: "not_found" })
  await expect(
    cli(f.env, ["search", "meetings", "Ship", "--source", "example:foreign", "--cursor", page.page.next_cursor]),
  ).rejects.toMatchObject({ code: "validation_error" })
})

it("exposes strict MCP meeting search/passage with evidence and unchanged review boundaries", async () => {
  const f = await fixture()
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(f.env, createProgram).connect(serverSide)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(clientSide)
  try {
    for (const name of ["search meetings", "meetings passage"])
      expect(await commandSchema(client, name)).toMatchObject({ additionalProperties: false })
    const result = await callCommand(client, {
      name: "search meetings",
      arguments: {
        source: f.source,
        query: "Ship topic:finance",
        project: "Observatory",
        meeting_id: String(f.saved.meeting.id),
        series_id: String(f.saved.meeting.meetingSeriesId),
        identity_id: String(f.saved.participants[0]?.identityId),
        person_id: String(f.person),
        since_time: "2026-10-01T00:00:00Z",
        until_time: "2026-10-31T23:59:59Z",
        limit: 1,
      },
    })
    const body = envelopeOf(JSON.stringify(result.structuredContent))
    expect(body.items).toHaveLength(1)
    const passage = await callCommand(client, {
      name: "meetings passage",
      arguments: { source: f.source, reference: body.items[0].ref, before_n: 1, after_n: 1 },
    })
    const packet = envelopeOf(JSON.stringify(passage.structuredContent)).item
    expect(packet.target_ref).toBe(body.items[0].ref)
    expect(packet.coverage.archive_completeness).toBe("unknown")
    const filtered = await callCommand(client, {
      name: "search meetings",
      arguments: { source: f.source, query: "Ship tag:review", event_id: "999999" },
    })
    expect(envelopeOf(JSON.stringify(filtered.structuredContent)).items).toEqual([])
    const checked = await callCommand(client, {
      name: "meetings passage",
      arguments: {
        source: f.source,
        reference: body.items[0].ref,
        expected_fingerprint: packet.target_fingerprint,
        max_read_bytes: 65536,
        bytes: 65536,
      },
    })
    expect(checked.isError).not.toBe(true)
    const stale = await callCommand(client, {
      name: "meetings passage",
      arguments: { source: f.source, reference: body.items[0].ref, expected_fingerprint: "0".repeat(64) },
    })
    expect(stale.isError).toBe(true)
    expect(JSON.stringify(stale.structuredContent)).toContain("changed")
    const bounded = await callCommand(client, {
      name: "meetings passage",
      arguments: { source: f.source, reference: body.items[0].ref, max_read_bytes: 1 },
    })
    expect(bounded.isError).toBe(true)
    const next = await callCommand(client, { name: "search meetings", arguments: body.next[0].args })
    expect(next.isError, JSON.stringify(next.structuredContent)).not.toBe(true)
    for (const [name, args] of [
      ["search meetings", { source: f.source, query: "Ship", project_name: "Observatory" }],
      ["meetings passage", { source: f.source, reference: body.items[0].ref, account_id: 999 }],
    ] as const) {
      const invalid = await callCommand(client, { name, arguments: args })
      expect(invalid.isError).toBe(true)
      expect(invalid.structuredContent).toMatchObject({
        error: { code: "validation_error", param: name === "search meetings" ? "project_name" : "account_id" },
      })
    }
  } finally {
    await client.close()
  }
})

it("uses the shared meeting selectors with explicit source scope", async () => {
  const f = await fixture()
  const page = await cli(f.env, [
    "search",
    "meetings",
    "Ship topic:finance",
    "--source",
    f.source,
    "--meeting-id",
    String(f.saved.meeting.id),
    "--series-id",
    String(f.saved.meeting.meetingSeriesId),
  ])
  expect(page.items.length).toBeGreaterThan(0)
  expect(page.items.every((item: { ref: string }) => item.ref.includes(String(f.saved.meeting.id)))).toBe(true)
  const absent = await cli(f.env, ["search", "meetings", "Ship tag:review", "--source", f.source])
  expect(absent.items).toEqual([])
})
