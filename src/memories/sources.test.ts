import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"
import { quotedEvidence, SOURCE_CHECK } from "./sources.js"

const AGENT = { AI_AGENT: "claude-code_2-1-296_agent" }
const NOBODY: Terminal = { present: false }
const OWNER: Terminal = { present: true }

afterEach(() => {
  process.exitCode = 0
})

const setUp = async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-sources-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-sources-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  updateConfig((config) => ({ ...config, agent_decisions: true }), env)
  const store = await openStore({ env })
  const note = await store.notes.addNote({ text: "We agreed delivery on the 28th. Call at 10." })
  const other = await store.notes.addNote({ text: "Delivery moved to the 30th." })
  await store.close()
  const run = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...agent }, terminal })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  const item = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) =>
    (await run(agent, terminal, ...args)).item
  const remember = (...extra: string[]) =>
    item({}, OWNER, "memories", "add", "Delivery is on the 28th", "--kind", "preference", "--scope", "work", ...extra)
  const edit = async (text: string, revision: number) => {
    const opened = await openStore({ env })
    await opened.notes.editNote(note.ref, text, revision)
    await opened.close()
  }
  return { env, note, other, run, item, remember, edit }
}

it("checks sources: a quote still said raises nothing, a changed source raises one review and is offered again", async () => {
  const f = await setUp()
  const kept = await f.remember("--evidence", f.note.ref, "--quote", `${f.note.ref}=delivery on the 28th`)
  const plain = await f.item({}, OWNER, "facts", "add", "Call at 10", "--kind", "decision", "--evidence", f.note.ref)
  await f.edit("We agreed delivery on the 28th. Call at 11.", 1)

  const check = await f.item(AGENT, NOBODY, "memories", "check", "--limit", "50")
  expect(v.parse(SOURCE_CHECK, check)).toEqual({
    checked: 2,
    baselined: 0,
    raised: 1,
    refreshed: 1,
    closed: 0,
    changed_refs: [f.note.ref],
  })
  expect(await f.item({}, OWNER, "memories", "show", kept.ref)).toMatchObject({ source_review: null })
  expect(await f.item({}, OWNER, "facts", "show", plain.ref)).toMatchObject({
    status: "accepted",
    source_review: { cause: "changed" },
  })
  expect(await f.item(AGENT, NOBODY, "memories", "check")).toMatchObject({ raised: 0, changed_refs: [] })
})

it("refuses a quote its source does not say, and one that names no --evidence reference", async () => {
  const f = await setUp()
  await expect(
    f.remember("--evidence", f.note.ref, "--quote", `${f.note.ref}=delivery on the 31st`),
  ).rejects.toMatchObject({ code: "validation_error", details: { reason: "evidence.quote-not-found", param: "quote" } })
  await expect(f.remember("--evidence", f.note.ref, "--quote", `${f.other.ref}=Delivery moved`)).rejects.toMatchObject({
    code: "validation_error",
    details: { reason: "evidence.quote-unmatched" },
  })
  expect((await f.run({}, OWNER, "memories", "list")).items).toEqual([])
})

it("pairs a quote with its reference even when the reference or the words hold =", () => {
  expect(quotedEvidence(["msg:email/a=b/1", "note:1"], ["msg:email/a=b/1=x = y", "note:1=z"])).toEqual([
    { ref: "msg:email/a=b/1", quote: "x = y" },
    { ref: "note:1", quote: "z" },
  ])
})

it("lets an agent challenge a memory, which only proposes, and refuses the agent's decision on it", async () => {
  const f = await setUp()
  const memory = await f.remember("--evidence", f.note.ref)
  const challenged = await f.item(
    AGENT,
    NOBODY,
    "memories",
    "challenge",
    memory.ref,
    "--evidence",
    f.other.ref,
    "--reason",
    "the later note moves delivery",
    "--suggest",
    "Delivery is on the 30th",
  )
  expect(challenged).toMatchObject({ kind: "memory_source_review", status: "proposed", owner_only: true })
  expect(await f.item({}, OWNER, "memories", "show", memory.ref)).toMatchObject({
    status: "confirmed",
    source_review: { id: challenged.id, cause: "contradicted" },
  })

  const shown = await f.item({}, OWNER, "review", "show", challenged.id)
  expect(shown.source_review).toMatchObject({
    cause: "contradicted",
    challenges: [{ evidence: [f.other.ref], reason: "the later note moves delivery", by: "claude-code" }],
    suggestions: [{ body: "Delivery is on the 30th" }],
    decide: { still_true: `memo review confirm ${challenged.id}`, withdraw: `memo memories invalidate ${memory.ref}` },
  })

  const refused = await f.run(AGENT, NOBODY, "review", "confirm", challenged.id, "--reason", "still right")
  expect(refused.item).toMatchObject({ decided: [], refused: [{ id: challenged.id, reason: "proposal.owner-only" }] })
  expect((await f.item({}, OWNER, "memories", "show", memory.ref)).source_review).toMatchObject({ id: challenged.id })
})

it("lets the owner answer still true from the app, which closes the review and re-signs the sources", async () => {
  const f = await setUp()
  const memory = await f.remember("--evidence", f.note.ref)
  await f.edit("We agreed delivery on the 29th.", 1)
  await f.item({}, OWNER, "memories", "check")
  const review = (await f.item({}, OWNER, "memories", "show", memory.ref)).source_review as { id: string }

  const shown = await f.item({}, OWNER, "review", "show", review.id)
  expect(shown.source_review.sources).toEqual([
    expect.objectContaining({
      ref: f.note.ref,
      cause: "changed",
      cited: "We agreed delivery on the 28th. Call at 10.",
      now: "We agreed delivery on the 29th.",
    }),
  ])

  const decided = await f.item(AGENT, NOBODY, "review", "confirm", review.id, "--from-app")
  expect(decided).toMatchObject({ decided: [{ id: review.id, status: "confirmed" }], refused: [] })
  expect(await f.item({}, OWNER, "memories", "show", memory.ref)).toMatchObject({
    status: "confirmed",
    source_review: null,
  })
  expect(await f.item({}, OWNER, "memories", "check")).toMatchObject({ raised: 0 })
})

it("challenges a fact the same way, and refuses a memory ref there", async () => {
  const f = await setUp()
  const fact = await f.item(
    {},
    OWNER,
    "facts",
    "add",
    "Call at 10",
    "--kind",
    "decision",
    "--evidence",
    f.note.ref,
    "--quote",
    `${f.note.ref}=Call at 10`,
  )
  const memory = await f.remember("--evidence", f.note.ref)
  const args = ["--evidence", f.other.ref, "--reason", "moved", "--suggest", "Call at 11"]
  expect(await f.item(AGENT, NOBODY, "facts", "challenge", fact.ref, ...args)).toMatchObject({
    kind: "memory_source_review",
    subject: fact.ref,
  })
  await expect(f.item(AGENT, NOBODY, "facts", "challenge", memory.ref, ...args)).rejects.toMatchObject({
    code: expect.stringMatching(/not_found|validation_error/),
  })
})
