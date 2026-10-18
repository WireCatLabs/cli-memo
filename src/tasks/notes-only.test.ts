import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-notes-only-"))
  const vault = join(root, "vault")
  mkdirSync(vault)
  writeFileSync(join(vault, "Plan.md"), "Book the venue for the team day.")
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  await run("folders", "add", vault, "--json")
  await run("sync", "--only", "notes", "--no-embed", "--json")
  return { env, run }
}

const refused = (text: string) => ({
  code: "validation_error",
  message: expect.stringContaining(text),
})

it("tells a notes-only store what tasks and reminders need, never offering a folder as an account", async () => {
  const { run } = await setUp()

  for (const args of [
    ["tasks", "list"],
    ["reminders", "list"],
    ["reminders", "poll"],
  ]) {
    const failure = run(...args, "--json")
    await expect(failure).rejects.toMatchObject(refused("memo tasks add --project <KEY> --title <title>"))
    await expect(failure).rejects.not.toMatchObject({ message: expect.stringContaining("folder:") })
  }
  await expect(run("tasks", "agenda", "--json")).rejects.toMatchObject(refused("memo tasks list project:<KEY>"))
  await expect(run("tasks", "list", "--source", "notes:1", "--json")).rejects.toMatchObject(
    refused("notes:1 holds no tasks or reminders"),
  )
  await expect(
    run("reminders", "add", "1", "--at-time", "2030-01-01T09:00:00+01:00", "--account", "notes:1", "--json"),
  ).rejects.toMatchObject(refused("notes:1 holds no tasks or reminders"))
})

it("lists only the accounts that can hold tasks", async () => {
  const { env, run } = await setUp()
  const store = await openStore({ env })
  await store.accounts.saveAccount({ provider: "telegram", account: "500" }, { name: null })
  await store.close()

  const failure = run("tasks", "list", "--json")
  await expect(failure).rejects.toMatchObject(refused("--source telegram:500"))
  await expect(failure).rejects.not.toMatchObject({ message: expect.stringContaining("folder:") })
})

it("points tasks list --project to the project: query word", async () => {
  const { run } = await setUp()

  await expect(run("tasks", "list", "--project", "SYNT", "--json")).rejects.toMatchObject(
    refused("memo tasks list project:SYNT"),
  )
})
