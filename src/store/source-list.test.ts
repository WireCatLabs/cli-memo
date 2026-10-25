import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { throwParseFailures } from "../failure.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-source-")), "store.db") }
  const store = await openStore({ env })
  for (const account of ["1", "2"]) await store.accounts.saveAccount({ provider: "telegram", account }, { name: null })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    throwParseFailures(program)
    await program.parseAsync([...args, "--json"], { from: "user" })
    return { answer: answerOf(streams.stdout.join("")), stderr: streams.stderr.join("") }
  }
  const note = async (text: string) => `note:${(await run("notes", "add", text)).answer.id}`
  return { run, note, env }
}

it("lists the tasks of every account --source names, oldest first, and names those accounts", async () => {
  const { run, note } = await setUp()
  const first = (await run("tasks", "add", await note("Synthetic first"), "--account", "telegram:1")).answer
  const second = (await run("tasks", "add", await note("Synthetic second"), "--account", "telegram:2")).answer

  const listed = (await run("tasks", "list", "--source", "telegram")).answer

  expect(listed.items.map(({ id }: { id: string }) => id)).toEqual([first.task.id, second.task.id])
  expect(listed.meta.accounts).toEqual(["telegram:1", "telegram:2"])
})

it("refuses a write that names no single provider:account, and lists the choices", async () => {
  const { run, note } = await setUp()
  const source = await note("Synthetic")

  await expect(run("tasks", "add", source, "--account", "telegram")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("--account takes provider:account"),
  })
  await expect(run("reminders", "add", "1", "--at-time", "2026-01-01T00:00:00Z")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("give --account <provider>:<account> — the store holds telegram:1, telegram:2"),
  })
  await expect(run("tasks", "add", source, "--provider", "telegram")).rejects.toMatchObject({
    code: "commander.unknownOption",
  })
})

it("lists the reminders of every stored account when --source names none, and says which", async () => {
  const { run } = await setUp()

  expect((await run("reminders", "list")).answer.meta.accounts).toEqual(["telegram:1", "telegram:2"])
})

it("reads the canonical source and refuses retired read flags", async () => {
  const { run } = await setUp()
  expect((await run("reminders", "list", "--source", "telegram:1")).answer.meta.accounts).toEqual(["telegram:1"])
  for (const flag of ["--provider", "--account"])
    await expect(run("reminders", "list", flag, "telegram:1")).rejects.toMatchObject({
      code: "commander.unknownOption",
    })
})

it("writes through one explicit account and refuses the retired provider flag", async () => {
  const { run, note } = await setUp()
  const source = await note("Synthetic")
  const { answer } = await run("tasks", "add", source, "--account", "telegram:2")
  expect(answer.task.account).toBe("telegram:2")
  await expect(run("tasks", "add", source, "--account", "2")).rejects.toMatchObject({ code: "validation_error" })
  await expect(run("tasks", "add", source, "--provider", "telegram", "--account", "2")).rejects.toMatchObject({
    code: "commander.unknownOption",
  })
})

it("acts as Drive's documents account by the notes:<id> the list reader gives it", async () => {
  const { run, note, env } = await setUp()
  const store = await openStore({ env })
  const drive = await store.notes.documentsAccount({ provider: "google-drive", account: "u1" }, true)
  await store.close()

  const { answer } = await run("tasks", "add", await note("Synthetic"), "--account", `notes:${drive?.id}`)
  expect(answer.task.account).toBe("google-drive:u1")
})

it("asks memo's own notes when --source names notes", async () => {
  const { run, note } = await setUp()
  const ref = await note("Synthetic lighthouse budget")

  for (const source of ["notes", "telegram:1,notes"]) {
    const { answer } = await run("answers", "create", "what about the lighthouse?", "lighthouse", "--source", source)
    expect(answer.evidence.map(({ locator }: { locator: string }) => locator)).toContain(ref)
  }
})

it("makes a task from a folder's file and reminds about it in a store that holds only notes", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-notes-only-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    throwParseFailures(program)
    await program.parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  mkdirSync(join(root, "vault"))
  writeFileSync(join(root, "vault", "plan.md"), "Send the synthetic budget.")
  await run("folders", "add", join(root, "vault"))
  await run("sync", "--only", "notes")
  const document = (await run("search", "notes", "budget")).items[0]
  const store = await openStore({ env })
  const folder = (await store.accounts.accounts())[0]
  await store.close()
  const stored = `${folder?.provider}:${folder?.account}`

  const added = await run("tasks", "add", document.ref)
  expect(added.task.account).toBe(stored)
  for (const account of [stored, `folder:${folder?.account}`, `notes:${document.folder_id}`])
    expect((await run("tasks", "add", document.ref, "--account", account)).task.id).toBe(added.task.id)
  expect((await run("tasks", "list")).items.map(({ id }: { id: string }) => id)).toEqual([added.task.id])
  expect((await run("tasks", "agenda", "--source", "notes")).tasks).toHaveLength(1)

  await run(
    "reminders",
    "add",
    added.task.key,
    "--at-time",
    "2030-01-01T09:00:00Z",
    "--account",
    `notes:${document.folder_id}`,
  )
  expect((await run("reminders", "list")).items).toMatchObject([{ task: added.task.id, account: stored }])
  await run("projects", "add", "Synthetic", "--key", "SYN")
  await run("tasks", "add", "--project", "SYN", "--title", "Book the room")
  await expect(
    run("reminders", "add", "SYN-1", "--at-time", "2030-01-01T09:00:00Z", "--account", stored),
  ).rejects.toMatchObject({ message: expect.stringContaining("SYN-1 is a task in a project") })
})
