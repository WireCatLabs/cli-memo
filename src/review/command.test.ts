import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { updateConfig } from "../config.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"
import { labelsFor } from "./review.js"

const CLAUDE = { AI_AGENT: "claude-code_2-1-296_agent" }
const CODEX = { AI_AGENT: "codex" }
const NOBODY: Terminal = { present: false }
const OWNER: Terminal = { present: true }

afterEach(() => {
  process.exitCode = 0
})

const setUp = async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-review-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-review-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  updateConfig((config) => ({ ...config, agent_decisions: true }), env)
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
  const team = await store.knowledge.addOrganization({ name: "Synthetic Studio", kind: "company" })
  const note = await store.notes.addNote({ text: "# Harbour brief\n\nThe launch plan." })
  await store.accounts.saveAccount({ provider: "telegram", account: "1" }, { name: null })
  await store.close()
  const raw = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...agent }, terminal })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const run = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) =>
    envelopeOf(await raw(agent, terminal, ...args, "--json"))
  const item = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) =>
    (await run(agent, terminal, ...args)).item
  const fact = async (agent: Record<string, string>, text: string) =>
    (await item(agent, NOBODY, "facts", "add", text, "--kind", "decision", "--project", "SYH", "--evidence", note.ref))
      .ref as string
  return { env, project, team, note, raw, run, item, fact }
}

/** One proposal of each kind an agent writes from its terminal, all about the project. */
const proposeAll = async (f: Awaited<ReturnType<typeof setUp>>) => {
  const relationship = await f.item(
    CLAUDE,
    NOBODY,
    ...["relationships", "add", f.team.ref, f.project.ref, "--kind", "related-to", "--reason", "builds the site"],
  )
  const key = await f.item(
    CLAUDE,
    NOBODY,
    ...["projects", "key-documents", "add", "SYH", f.note.ref, "--reason", "the brief"],
  )
  const fact = await f.fact(CLAUDE, "Kickoff moved to Friday")
  const memory = await f.item(
    CLAUDE,
    NOBODY,
    ...["memories", "add", "Prefers short replies", "--kind", "preference", "--scope", "work"],
    ...["--project", "SYH", "--evidence", f.note.ref],
  )
  const action = await f.item(
    CLAUDE,
    NOBODY,
    ...["actions", "add", "reply", "--reason", "asked twice", "--account", "telegram:1", "--target", f.project.ref],
  )
  return { relationship, key, fact, memory, action }
}

it("lists every kind of pending proposal with titles, who proposed it and the steps to decide", async () => {
  const f = await setUp()
  const made = await proposeAll(f)
  const listed = await f.run({}, OWNER, "review")
  expect(new Set(listed.items.map((one: { kind: string }) => one.kind))).toEqual(
    new Set(["relationship", "key_document", "fact", "memory", "action"]),
  )
  const byKind = (kind: string) => listed.items.find((one: { kind: string }) => one.kind === kind)
  expect(byKind("relationship")).toMatchObject({
    id: made.relationship.id,
    title: expect.stringMatching(/Synthetic Studio.*→.*Synthetic Harbour/),
    proposer: "claude-code",
    reason: "builds the site",
    status: "proposed",
  })
  expect(byKind("key_document")).toMatchObject({ id: made.key.id, title: expect.stringContaining("key document") })
  expect(byKind("fact")).toMatchObject({ id: made.fact, title: '"Kickoff moved to Friday"' })
  expect(listed.next.map((step: { step: string }) => step.step)).toEqual(["review.confirm", "review.show"])

  const relationships = await f.run({}, OWNER, "review", "kind:relationship,key_document", "by:claude-code")
  expect(relationships.items).toHaveLength(2)
  expect((await f.run({}, OWNER, "review", "by:rule")).items).toEqual([])
  expect((await f.run({}, OWNER, "review", "project:SYH", "kind:fact")).items).toHaveLength(1)
  await expect(f.run({}, OWNER, "review", "kind:nonsense")).rejects.toMatchObject({ code: "validation_error" })

  const text = await f.raw({}, OWNER, "review", "kind:relationship")
  expect(text).toContain(`${made.relationship.id}  relationship`)
  expect(text).toContain("builds the site")
  const compact = await f.raw({}, OWNER, "review", "kind:relationship", "--compact")
  expect(compact).toContain(made.relationship.id)
  expect(compact).toContain("claude-code")

  const shown = await f.item({}, OWNER, "review", "show", made.key.id)
  expect(shown).toMatchObject({ kind: "key_document", evidence: [{ ref: f.note.ref, state: "untracked" }] })
  expect(shown.evidence[0].title).toMatch(/^Note /)
  const brief = await f.item({}, OWNER, "review", "show", made.key.id, "--brief", "--before-n", "1", "--after-n", "1")
  expect(brief.evidence).toEqual([
    { ref: f.note.ref, title: shown.evidence[0].title, untrusted: shown.evidence[0].untrusted },
  ])
})

it("decides each id on its own: one refusal leaves the rest decided and the exit code non-zero", async () => {
  const f = await setUp()
  const theirs = [await f.fact(CLAUDE, "One"), await f.fact(CLAUDE, "Two")]
  const own = await f.fact(CODEX, "Three")
  const decided = await f.run(CODEX, NOBODY, "review", "confirm", `${theirs.join(",")},${own}`, "--reason", "checked")
  expect(decided.item.decided.map((one: { id: string }) => one.id)).toEqual(theirs)
  expect(decided.item.refused).toMatchObject([{ id: own, reason: "proposal.own" }])
  expect(decided.meta).toMatchObject({ complete: false, issues: [{ code: "permission_error", source: own }] })
  expect(process.exitCode).not.toBe(0)
  process.exitCode = 0
  expect((await f.item({}, OWNER, "facts", "show", theirs[0] as string)).status).toBe("accepted")
  expect((await f.item({}, OWNER, "facts", "show", own)).status).toBe("proposed")

  const again = await f.run({}, OWNER, "review", "confirm", theirs[0] as string)
  expect(again.item.refused).toMatchObject([{ reason: "proposal.wrong-state" }])
  process.exitCode = 0
  expect((await f.run({}, OWNER, "review", "reject", own, "--reason", "not agreed")).item.decided).toMatchObject([
    { id: own, status: "rejected" },
  ])
})

it("lets the owner confirm ten proposals in one range", async () => {
  const f = await setUp()
  const store = await openStore({ env: f.env })
  const ids: string[] = []
  try {
    for (let n = 0; n < 10; n++)
      ids.push(
        (
          await store.proposedActions.propose({
            kind: "relationship",
            by: { bot: "claude-code" },
            target: f.team.ref,
            payload: { from: f.team.ref, to: f.project.ref, kind: "related-to", role: `role ${n}` },
            reason: "synthetic",
          })
        ).id,
      )
  } finally {
    await store.close()
  }
  const listed = await f.run({}, OWNER, "review", "project:SYH")
  expect(listed.next[0].args.ids).toBe(`${ids[0]}-${ids[9]}`)
  const decided = await f.item({}, OWNER, "review", "confirm", `${ids[0]}-${ids[9]}`)
  expect(decided.decided).toHaveLength(10)
  expect(decided.refused).toEqual([])
  expect((await f.run({}, OWNER, "review")).items).toEqual([])
})

it("asks for --reason and refuses --as-owner without a terminal", async () => {
  const f = await setUp()
  const fact = await f.fact(CLAUDE, "One")
  await expect(f.run(CODEX, NOBODY, "review", "confirm", fact)).rejects.toMatchObject({
    details: { reason: "proposal.reason-required" },
  })
  await expect(f.run(CLAUDE, NOBODY, "review", "confirm", fact, "--as-owner")).rejects.toMatchObject({
    code: "confirmation_required",
    details: { reason: "decision.owner-unconfirmed" },
  })
})

it("keeps review confirm and reject from an MCP client unless the owner allows them", async () => {
  const f = await setUp()
  await f.fact(CLAUDE, "One")
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(f.env, createProgram).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  try {
    const catalogue = await client.callTool({ name: "memo_tools_search", arguments: {} })
    const items = (
      catalogue.structuredContent as { items: { command: string; availability: { available: boolean } }[] }
    ).items
    for (const name of ["review confirm", "review reject"])
      expect(items.find((one) => one.command === name)?.availability.available).toBe(false)
    expect(items.find((one) => one.command === "review list")?.availability.available).toBe(true)
  } finally {
    await client.close()
  }
})

it("lists pending relationships with confirmed:false, titles and purpose", async () => {
  const f = await setUp()
  const store = await openStore({ env: f.env })
  try {
    await store.knowledge.relate(null, {
      by: "owner",
      from: f.team.ref,
      to: f.project.ref,
      kind: "member-of",
      purpose: "sales",
    })
    const label = await labelsFor(store, [f.project.ref, "person:999"])
    expect(label("person:999")).toBeNull()
    expect(label(f.project.ref)).toContain("Synthetic Harbour")
  } finally {
    await store.close()
  }
  const proposal = await f.item(
    CLAUDE,
    NOBODY,
    "relationships",
    "add",
    f.team.ref,
    f.project.ref,
    "--kind",
    "related-to",
  )
  const pending = await f.run({}, OWNER, "relationships", "list", `about:"${f.project.ref}"`, "confirmed:false")
  expect(pending.items).toMatchObject([
    { id: proposal.id, status: "proposed", kind: "related-to", proposer: "claude-code", confirmed: false },
  ])
  expect(pending.items[0].from_title).toContain("Synthetic Studio")
  const links = await f.run({}, OWNER, "relationships", "list", "confirmed:true")
  expect(links.items).toMatchObject([
    { from: f.team.ref, purpose: "sales", confirmed: true, to_title: expect.stringContaining("Synthetic Harbour") },
  ])
})
