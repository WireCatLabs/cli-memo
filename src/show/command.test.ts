import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { expect, it } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-show-"))
  const accounts = join(root, "tg-state", "accounts")
  mkdirSync(accounts, { recursive: true })
  writeFileSync(join(accounts, "work.json"), JSON.stringify({ account: "1" }))
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db"), TG_STATE_DIR: join(root, "tg-state") }
  const store = await openStore({ env })
  await store.messages.saveMessages(
    { provider: "telegram", account: "1" },
    "-100",
    [
      {
        id: "7",
        chatId: "-100",
        senderId: "9",
        senderName: "Kai Sample",
        timestamp: "2026-10-01T10:00:00.000Z",
        editedAt: null,
        text: "The budget for the harbour plan is ready",
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "test" },
  )
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    process.exitCode = 0
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return { stdout: streams.stdout.join(""), stderr: streams.stderr.join(""), code: process.exitCode }
  }
  const json = async (...args: string[]) => answerOf((await run(...args, "--json")).stdout)
  return { env, root, run, json }
}

const commandAt = (program: Command, words: readonly string[]) => {
  let at: Command | undefined = program
  for (const word of words) at = at?.commands.find((one) => one.name() === word)
  return at
}

it("says what each reference names and the command that opens it, in the order given", async () => {
  const { json, run } = await setUp()
  const note = await json("notes", "add", "Harbour plan draft", "--title", "Harbour plan")
  const fact = await json("facts", "add", "Releases go out on Fridays", "--kind", "decision")
  const project = await json("projects", "add", "Synthetic Harbour", "--key", "SYH")
  const organization = await json("organizations", "add", "Example Org", "--kind", "company")
  const memory = await json(
    "memories",
    "add",
    "Kai prefers calls in the morning",
    "--kind",
    "preference",
    "--scope",
    "work",
    "--evidence",
    "msg:telegram/1/-100/7",
  )
  const { task } = await json("tasks", "add", "msg:telegram/1/-100/7", "--type", "request")
  const gone = await json("notes", "add", "Scratch")
  await json("notes", "remove", gone.ref)
  const refs = [
    "chat:telegram/1/-100",
    "msg:telegram/1/-100/7",
    note.ref,
    fact.ref,
    project.ref,
    organization.ref,
    "person:2",
    memory.ref,
    `task:${task.id}`,
    gone.ref,
  ]

  const { stdout, code } = await run("show", ...refs, "--json")
  expect(code).toBe(0)
  const answer = envelopeOf(stdout)
  expect(answer.meta.complete).toBe(false)
  expect(answer.items.map((one: { ref: string }) => one.ref)).toEqual(refs)
  const [chat, message, shownNote, ...rest] = answer.items
  expect(chat).toMatchObject({
    kind: "chat",
    in: "Telegram",
    tool: "tg",
    state: "available",
    open: { argv: ["tg", "work", "messages", "list", "chat:telegram/1/-100"], profiles: ["work"], why: null },
    untrusted: ["title", "in"],
  })
  expect(message).toMatchObject({ kind: "message", open: { argv: ["tg", "work", "messages", "show", refs[1]] } })
  expect(shownNote).toMatchObject({ kind: "note", title: "Harbour plan", state: "available" })
  expect(shownNote.untrusted).toBeUndefined()
  expect(rest.map((one: { kind: string; state: string }) => [one.kind, one.state])).toEqual([
    ["fact", "available"],
    ["project", "available"],
    ["organization", "available"],
    ["person", "available"],
    ["memory", "available"],
    ["task", "available"],
    ["note", "unavailable"],
  ])

  const program = createProgram({ streams: captureStreams() })
  for (const one of answer.items.filter((item: { tool: string }) => item.tool === "memo")) {
    const words = one.open.argv.slice(1).filter((word: string) => /^[a-z]+$/.test(word))
    expect(commandAt(program, words), `memo ${words.join(" ")}`).toBeDefined()
  }
  expect(answer.items.at(-2).open.argv).toEqual(["memo", "tasks", "show", task.id, "--source", "telegram:1"])
  for (const one of answer.items.slice(2, -1)) expect((await run(...one.open.argv.slice(1))).code).toBe(0)
})

it("never picks a profile: with two on the account it keeps <profile> and lists them", async () => {
  const { root, run } = await setUp()
  writeFileSync(join(root, "tg-state", "accounts", "spare.json"), JSON.stringify({ account: "1" }))
  const { stdout } = await run("show", "chat:telegram/1/-100")
  expect(stdout).toContain("open: tg <profile> messages list chat:telegram/1/-100")
  expect(stdout).toContain("2 tg profiles are signed in to account 1: spare, work")
  const [item] = envelopeOf((await run("show", "chat:telegram/1/-100", "--json")).stdout).items
  expect(item.open).toMatchObject({ argv: ["tg", "<profile>", "messages", "list", "chat:telegram/1/-100"] })
  expect(item.open.profiles).toEqual(["spare", "work"])
})

it("refuses a bare number with the references that exist, and a typo with the kind it meant", async () => {
  const { json, run } = await setUp()
  const note = await json("notes", "add", "Harbour plan draft")
  const id = note.ref.slice("note:".length)
  await expect(run("notes", "show", id)).rejects.toMatchObject({
    code: "validation_error",
    message:
      `"${id}" is a bare number; did you mean ${note.ref}? To read a file named ${id}, give its path: ./${id}`.replace(
        "? To",
        "?; to",
      ),
    details: { reason: "ref.bare-number" },
  })
  await expect(run("notes", "show", "4242")).rejects.toThrow(/no note or document has id 4242/)
  await expect(run("notes", "edit", id, "--revision", "1", "--text", "x")).rejects.toThrow(`did you mean ${note.ref}`)
  await expect(run("notes", "remove", id)).rejects.toThrow(`did you mean ${note.ref}`)
  await expect(run("show", id)).rejects.toThrow(`did you mean ${note.ref}`)
  await json("projects", "add", "Synthetic Harbour", "--key", "SYH")
  await expect(run("projects", "key-documents", "add", "SYH", id, "--reason", "plan")).rejects.toThrow(
    `did you mean ${note.ref}`,
  )
  await expect(run("tasks", "add", id)).rejects.toThrow(`did you mean ${note.ref}`)
  await expect(run("show", "doc:413")).rejects.toMatchObject({ details: { reason: "ref.unknown-kind" } })
  expect((await json("notes", "show", note.ref)).ref).toBe(note.ref)
})

it("prints one line per item with --compact, keeping each reference, and refuses it with --json", async () => {
  const { json, run } = await setUp()
  await json("notes", "add", "Harbour plan draft", "--title", "Harbour plan")
  await json("facts", "add", "Releases go out on Fridays", "--kind", "decision")

  const notes = await run("notes", "list", "--compact")
  expect(notes.stdout).toMatch(/^note:1 · \d\d-\d\d · internal · Harbour plan · Harbour plan draft$/m)
  const facts = await run("facts", "list", "--compact")
  expect(facts.stdout).toMatch(/^fact:1 · decision · accepted · \d\d-\d\d · Releases go out on Fridays$/m)
  const found = await run("search", "all", "budget", "--compact")
  expect(found.stdout).toContain("msg:telegram/1/-100/7 · message · 10-01")
  expect(found.stdout).toContain("· Kai Sample · The budget for the harbour plan is ready")
  expect(found.stdout).toMatch(/^# complete: false/m)
  await json("projects", "add", "Harbour", "--key", "HBR")
  const evidence = await run("projects", "evidence", "HBR", "--source", "telegram:1", "--compact")
  expect(evidence.stdout).toContain(
    "msg:telegram/1/-100/7 · project · message · The budget for the harbour plan is ready",
  )
  expect(evidence.stdout).toContain("person:2 · Kai Sample · 1 items")
  const show = await run("show", "chat:telegram/1/-100", "--compact")
  expect(show.stdout).toContain("chat:telegram/1/-100 · chat · available · tg work messages list chat:telegram/1/-100")

  await expect(run("notes", "list", "--compact", "--json")).rejects.toMatchObject({ code: "validation_error" })
  await expect(run("search", "messages", "budget", "--brief", "--compact")).rejects.toThrow(/pick one/)
})
