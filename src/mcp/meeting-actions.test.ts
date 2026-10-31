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
import { commandCaller } from "../../test/mcp.js"
import { updateConfig } from "../config.js"
import { markKey } from "../knowledge/key-documents.js"
import { createProgram } from "../program.js"
import { createMemoServer } from "./server.js"

const fixture = async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-followups-")), "store"),
  }
  const account = { provider: "example", account: "synthetic" }
  const store = await openStore({ env })
  try {
    const id = await store.accounts.saveAccount(account, { name: "Synthetic" })
    await store.accounts.saveAccount({ ...account, account: "other" }, { name: "Other" })
    const sample = sampleMeeting()
    sample.meeting.accountId = id
    const saved = await store.meetings.saveMeeting(sample)
    const project = await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SHR" })
    await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Harbour Launch")
    await store.knowledge.linkMeetingProject(account, String(saved.meeting.id), project.id, { by: "owner" })
    const note = await store.notes.addNote({ text: "Synthetic evidence" })
    await store.facts.add({
      type: "statement",
      statement: "Review the draft",
      project: project.ref,
      evidence: [note.ref],
      by: { bot: "synthetic" },
    })
    await store.tasks.create({ project: project.ref, title: "Existing accepted work", type: "chore" }, "owner")
    await markKey(store, project, note.ref, "Read first", { bot: "synthetic" })
    const foreign = await store.knowledge.addProject({ name: "Other project", key: "OTH" })
    await store.facts.add({
      type: "statement",
      statement: "Unrelated work",
      project: foreign.ref,
      evidence: [note.ref],
      by: { bot: "synthetic" },
    })
    await store.knowledge.relate(null, {
      from: foreign.ref,
      to: project.ref,
      kind: "related-to",
      confirmed: false,
      provenance: "agent:synthetic",
    })
    await store.knowledge.linkMeetingProject(account, String(saved.meeting.id), foreign.id, { by: "owner" })
    return { env, account, project, foreign }
  } finally {
    await store.close()
  }
}
const connected = async (env: NodeJS.ProcessEnv) => {
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(server)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(transport)
  const command = await commandCaller(client)
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await command(name, args)
    return {
      ...(result.isError ? result.structuredContent : envelopeOf(JSON.stringify(result.structuredContent))),
      failed: result.isError,
    }
  }
  return { client, call }
}
const inputFor = async (call: Awaited<ReturnType<typeof connected>>["call"], project: string) => {
  const source = "example:synthetic"
  const hits = await call("search meetings", { source, query: "Ship" })
  const passage = await call("meetings passage", { source, reference: hits.items[0].ref })
  return {
    schema_version: 1,
    key: "harbour-followups",
    extractor: "synthetic",
    findings: [
      {
        id: "followup",
        kind: "task",
        type: "chore",
        title: "Check draft status",
        reason: "Verify current status",
        commitment: "inferred",
        project,
        evidence: [{ reference: passage.item.target_ref, fingerprint: passage.item.target_fingerprint }],
      },
    ],
  }
}

it("stages replay-safe attributed proposals, exposes previews and keeps project review separate from actual tasks", async () => {
  const f = await fixture(),
    { client, call } = await connected(f.env)
  try {
    const input = await inputFor(call, f.project.ref)
    const args = { account: "example:synthetic", input }
    const first = await call("meetings actions add", args)
    expect(first.failed).not.toBe(true)
    expect(first.item).toMatchObject({ status: "proposed", receipt: null, author: { type: "bot", name: "synthetic" } })
    expect((await call("meetings actions add", args)).item.id).toBe(first.item.id)
    expect((await call("meetings actions show", { source: args.account, id: first.item.id })).item).toEqual(first.item)
    expect(
      (await call("meetings actions list", { source: args.account, query: "status:proposed" })).items,
    ).toHaveLength(1)
    expect((await call("meetings actions show", { source: "example:other", id: first.item.id })).failed).toBe(true)
    const context = (await call("projects context", { project: "Harbour Launch" })).item
    expect(context.review.key_documents).toMatchObject([{ ref: "note:1", confirmed: false }])
    expect(context.review.relationships).toHaveLength(1)
    expect(context.review.facts.items).toMatchObject([{ text: "Review the draft", status: "proposed" }])
    expect(context.review.meeting_actions.items).toMatchObject([{ id: first.item.id, findings: [{ id: "followup" }] }])
    expect(context.open_tasks.items).toMatchObject([{ title: "Existing accepted work", key: "SHR-1" }])
    expect(context.open_tasks.items).toHaveLength(1)
    const streams = captureStreams()
    await createProgram({ env: f.env, streams }).parseAsync(["projects", "context", "Harbour Launch"], { from: "user" })
    expect(streams.stdout.join("")).toContain(`batch ${first.item.id}/followup [task]: Check draft status`)
    const catalogue = await client.callTool({ name: "memo_tools_search", arguments: {} })
    const items = (
      catalogue.structuredContent as { items: { command: string; availability: { available: boolean } }[] }
    ).items
    for (const name of ["meetings actions confirm", "meetings actions reject"])
      expect(items.find((item) => item.command === name)?.availability.available).toBe(false)
  } finally {
    await client.close()
  }
})

it("rejects unknown nested fields, changed retry input and stale evidence without staging extra proposals", async () => {
  const f = await fixture(),
    { client, call } = await connected(f.env)
  try {
    const input = await inputFor(call, f.project.ref)
    const args = { account: "example:synthetic", input }
    const unknown = await call("meetings actions add", { ...args, input: { ...input, confirm: true } })
    expect(unknown.error).toMatchObject({ code: "validation_error", message: "unknown meeting finding field" })
    const nested = await call("meetings actions add", {
      ...args,
      input: { ...input, findings: [{ ...input.findings[0], owner: true }] },
    })
    expect(nested.error.code).toBe("validation_error")
    expect(nested.error.message).toBe("unknown meeting finding field")
    await call("meetings actions add", args)
    expect((await call("meetings actions add", { ...args, account: "example:other" })).failed).toBe(true)
    expect((await call("meetings actions add", { ...args, input: { ...input, extractor: "changed" } })).failed).toBe(
      true,
    )
    expect(
      (
        await call("meetings actions add", {
          ...args,
          input: {
            ...input,
            key: "stale",
            findings: [
              { ...input.findings[0], evidence: [{ ...input.findings[0]?.evidence[0], fingerprint: "0".repeat(64) }] },
            ],
          },
        })
      ).failed,
    ).toBe(true)
    expect((await call("meetings actions list", { source: args.account })).items).toHaveLength(1)
  } finally {
    await client.close()
  }
})

it("reports capped project facts and preserves their pending status", async () => {
  const f = await fixture()
  const store = await openStore({ env: f.env })
  try {
    for (let i = 0; i < 20; i++)
      await store.facts.add({
        type: "statement",
        statement: `Synthetic finding ${i}`,
        project: f.project.ref,
        evidence: ["note:1"],
        by: { bot: "synthetic" },
      })
  } finally {
    await store.close()
  }
  const { client, call } = await connected(f.env)
  try {
    const context = (await call("projects context", { project: "SHR" })).item
    expect(context.review.facts.items).toHaveLength(20)
    expect(context.review.facts.has_more).toBe(true)
    expect(context.review.facts.next.command).toBe("facts list")
    const continued = await call("facts list", context.review.facts.next.args)
    expect(continued.error).toBeUndefined()
    expect(continued.items).toHaveLength(21)
    expect(context.review.facts.items.every((fact: { status: string }) => fact.status === "proposed")).toBe(true)
  } finally {
    await client.close()
  }
})

it("filters mixed-project batches in context while preserving the full preview for review", async () => {
  const f = await fixture(),
    { client, call } = await connected(f.env)
  try {
    const input = await inputFor(call, f.project.ref)
    const staged = await call("meetings actions add", {
      account: "example:synthetic",
      input: {
        ...input,
        findings: [...input.findings, { ...input.findings[0], id: "other-project", project: f.foreign.ref }],
      },
    })
    expect(staged.failed).not.toBe(true)
    const context = (await call("projects context", { project: "SHR" })).item
    expect(context.review.meeting_actions.items[0].findings).toHaveLength(1)
    expect(context.review.meeting_actions.items[0].findings[0].project).toBe(f.project.ref)
    const full = await call("meetings actions show", { source: "example:synthetic", id: staged.item.id })
    expect(full.item.input.findings).toHaveLength(2)
  } finally {
    await client.close()
  }
})

it("allows an explicitly delegated meeting decision and refuses it after permission revocation", async () => {
  const f = await fixture()
  f.env.MEMO_CONFIG_DIR = mkdtempSync(join(tmpdir(), "memo-decision-config-"))
  updateConfig((config) => ({ ...config, permissions: { "meetings.actions.confirm": "allow" } }), f.env)
  const { client, call } = await connected(f.env)
  try {
    const input = await inputFor(call, f.project.ref)
    const staged = await call("meetings actions add", { account: "example:synthetic", input })
    const reviewed = await call("meetings actions confirm", {
      id: String(staged.item.id),
      ids: ["followup"],
      account: "example:synthetic",
      fingerprint: staged.item.fingerprint,
    })
    expect(reviewed.failed, JSON.stringify(reviewed)).not.toBe(true)
    expect((await call("projects context", { project: f.project.ref })).item.open_tasks.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Check draft status" })]),
    )
    updateConfig((config) => ({ ...config, permissions: { "meetings.actions.confirm": "deny" } }), f.env)
    expect(
      (
        await call("meetings actions confirm", {
          id: String(staged.item.id),
          ids: ["followup"],
          account: "example:synthetic",
          fingerprint: staged.item.fingerprint,
        })
      ).error,
    ).toMatchObject({ code: "permission_error" })
  } finally {
    await client.close()
  }
})
