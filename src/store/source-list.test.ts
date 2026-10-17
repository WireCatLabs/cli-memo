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
  const first = (await run("tasks", "add", await note("Synthetic first"), "--source", "telegram:1")).answer
  const second = (await run("tasks", "add", await note("Synthetic second"), "--source", "telegram:2")).answer

  const listed = (await run("tasks", "list", "--source", "telegram")).answer

  expect(listed.items.map(({ id }: { id: string }) => id)).toEqual([first.task.id, second.task.id])
  expect(listed.meta.accounts).toEqual(["telegram:1", "telegram:2"])
})

it("refuses a write that --source does not narrow to one account, and lists the choices", async () => {
  const { run, note } = await setUp()

  await expect(run("tasks", "add", await note("Synthetic"), "--source", "telegram")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("give one: telegram:1, telegram:2"),
  })
  await expect(run("reminders", "list")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("the store holds telegram:1, telegram:2"),
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
