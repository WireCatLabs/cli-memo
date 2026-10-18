import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-source-")), "store.db") }
  const store = await openStore({ env })
  for (const account of ["1", "2"]) await store.accounts.saveAccount({ provider: "telegram", account }, { name: null })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return { answer: answerOf(streams.stdout.join("")), stderr: streams.stderr.join("") }
  }
  const note = async (text: string) => `note:${(await run("notes", "add", text)).answer.id}`
  return { run, note }
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
    message: expect.stringContaining(
      "give --account — tasks and reminders belong to a messenger or mail account: --account telegram:1; --account telegram:2",
    ),
  })
  await expect(run("tasks", "add", source, "--provider", "telegram")).rejects.toMatchObject({
    message: expect.stringContaining("give one: telegram:1, telegram:2"),
  })
  await expect(run("reminders", "list")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("--source telegram:1; --source telegram:2"),
  })
})

it("takes the old --provider --account for one release, and prints the new spelling on stderr", async () => {
  const { run } = await setUp()

  const { answer, stderr } = await run("reminders", "list", "--provider", "telegram", "--account", "1")

  expect(answer.meta.accounts).toEqual(["telegram:1"])
  expect(stderr).toContain("use --source telegram:1")
  await expect(
    run("reminders", "list", "--provider", "telegram", "--account", "1", "--source", "telegram:1"),
  ).rejects.toMatchObject({ code: "validation_error" })
})

it("takes the old --provider --account on a write for one release, as --account provider:account", async () => {
  const { run, note } = await setUp()

  const { answer, stderr } = await run(
    "tasks",
    "add",
    await note("Synthetic"),
    "--provider",
    "telegram",
    "--account",
    "2",
  )

  expect(answer.task.account).toBe("telegram:2")
  expect(stderr).toContain("use --account telegram:2")
  await expect(
    run("tasks", "add", await note("Synthetic"), "--provider", "telegram", "--account", "telegram:2"),
  ).rejects.toMatchObject({ code: "validation_error" })
})

it("asks memo's own notes when --source names notes", async () => {
  const { run, note } = await setUp()
  const ref = await note("Synthetic lighthouse budget")

  for (const source of ["notes", "telegram:1,notes"]) {
    const { answer } = await run("ask", "what about the lighthouse?", "lighthouse", "--source", source)
    expect(answer.evidence.map(({ locator }: { locator: string }) => locator)).toContain(ref)
  }
})
