import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const telegram = { provider: "telegram", account: "1" }
const message = (id: string, text: string) => ({
  id,
  chatId: "7",
  senderId: "9",
  senderName: null,
  timestamp: "2026-10-09T00:00:00Z",
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const setUp = async (agent: Record<string, string> = {}) => {
  const env = { ...process.env, ...agent, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-key-")), "s.db") }
  const store = await openStore({ env })
  await store.messages.saveMessages(telegram, "7", [message("5", "Harbour budget agreed")], { via: "test" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  const plan = await run("notes", "add", "# Harbour plan\n\nHarbour plan, the one to read first")
  const draft = await run("notes", "add", "# Harbour draft\n\nHarbour draft notes")
  return { env, run, plan: plan.ref as string, draft: draft.ref as string }
}

it("marks a note and a message as key documents of a project, with the reason and who marked it", async () => {
  const { run, plan } = await setUp()
  await run("projects", "key-documents", "add", "SYH", plan, "--reason", "the plan everyone follows")
  await run("projects", "key-documents", "add", "project:1", "msg:telegram/1/7/5", "--reason", "the agreed budget")

  const listed = await run("projects", "key-documents", "list", "1")
  expect(listed.items).toMatchObject([
    { ref: plan, title: "Harbour plan", reason: "the plan everyone follows", available: true, confirmed: true },
    { ref: "msg:telegram/1/7/5", reason: "the agreed budget", available: true, origin: "owner" },
  ])

  const context = await run("projects", "context", "SYH")
  expect(Object.keys(context)[0]).toBe("key_documents")
  expect(context.key_documents.map((item: { ref: string }) => item.ref)).toEqual([plan, "msg:telegram/1/7/5"])
  expect(context.relationships).toEqual([])

  await run("projects", "key-documents", "remove", "SYH", plan)
  expect((await run("projects", "key-documents", "list", "SYH")).items).toMatchObject([{ ref: "msg:telegram/1/7/5" }])
})

it("keeps a key document whose source is gone, marked unavailable", async () => {
  const { env, run } = await setUp()
  await run("projects", "key-documents", "add", "SYH", "msg:telegram/1/7/5", "--reason", "the agreed budget")
  const store = await openStore({ env })
  await store.messages.markDeleted(telegram, ["5"], { chatId: "7" })
  await store.close()

  expect((await run("projects", "context", "SYH")).key_documents).toMatchObject([
    { ref: "msg:telegram/1/7/5", reason: "the agreed budget", available: false },
  ])
})

it("adds, lists and removes key documents through exact project names and aliases", async () => {
  const { run, plan } = await setUp()
  const vocabulary = await run("vocabulary", "list", "kind:project")
  await run("vocabulary", "aliases", "add", "project:1", "Harbour Launch", "--fingerprint", vocabulary.fingerprint)

  await run("projects", "key-documents", "add", "harbour launch", plan, "--reason", "read first")
  expect((await run("projects", "key-documents", "list", "Synthetic Harbour")).items).toMatchObject([
    { ref: plan, reason: "read first" },
  ])
  expect((await run("projects", "context", "Harbour Launch")).key_documents).toMatchObject([{ ref: plan }])
  await run("projects", "key-documents", "remove", "Harbour Launch", plan)
  expect((await run("projects", "key-documents", "list", "1")).items).toEqual([])
})

it("refuses an ambiguous project before adding a key document", async () => {
  const { run, plan } = await setUp()
  await run("projects", "add", "Synthetic Harbour", "--key", "HBR")
  await expect(
    run("projects", "key-documents", "add", "Synthetic Harbour", plan, "--reason", "read first"),
  ).rejects.toMatchObject({ code: "validation_error" })
  for (const key of ["SYH", "HBR"]) expect((await run("projects", "key-documents", "list", key)).items).toEqual([])
})

it("records an agent's mark as unconfirmed, by that agent", async () => {
  const { run, plan } = await setUp({ AI_AGENT: "claude-code_2-1-296_agent" })
  expect(await run("projects", "key-documents", "add", "SYH", plan, "--reason", "read first")).toMatchObject({
    confirmed: false,
    origin: "suggested",
    provenance: "agent:claude-code",
  })
})

it("refuses a project or a source the store does not hold", async () => {
  const { run, plan } = await setUp()
  await expect(run("projects", "key-documents", "add", "NOPE", plan, "--reason", "x")).rejects.toMatchObject({
    code: "not_found",
  })
  await expect(run("projects", "key-documents", "add", "SYH", "note:99", "--reason", "x")).rejects.toMatchObject({
    code: "not_found",
  })
})

it("ranks a project's key documents first in a search, labelled, without dropping the rest", async () => {
  const { run, plan, draft } = await setUp()
  const vocabulary = await run("vocabulary", "list", "kind:project")
  await run("vocabulary", "aliases", "add", "project:1", "Harbour Launch", "--fingerprint", vocabulary.fingerprint)
  await run("projects", "key-documents", "add", "SYH", draft, "--reason", "the latest draft")

  const all = await run("search", "all", "Harbour", "--only", "notes", "--project", "Harbour Launch")
  expect(all.items[0]).toMatchObject({ ref: draft })
  expect(all.items.map((item: { ref: string }) => item.ref)).toContain(plan)

  const notes = await run("search", "notes", "Harbour", "--project", "Synthetic Harbour")
  expect(notes.items[0]).toMatchObject({ ref: draft, key: true })
  expect(notes.items.map((hit: { ref: string }) => hit.ref)).toContain(plan)
})
