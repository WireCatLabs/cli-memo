import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { applyTaskRulesToStored } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

const key = { provider: "telegram", account: "500" }
const scope = ["--provider", "telegram", "--account", "500"]
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const said = (id: string, minutes: number, text: string, extra: Partial<Message> = {}): Message => ({
  id,
  chatId: "7",
  senderId: extra.outgoing ? "500" : "9",
  senderName: extra.outgoing ? null : "Alice Example",
  timestamp: minutesAgo(minutes),
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
  ...extra,
})

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-shared-tasks-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const store = await openStore({ env })
  await store.accounts.saveAccount(key, { name: null })
  await store.messages.saveMessages(key, "7", [said("1", 60, "morning"), said("2", 50, "who has the keys?")], {
    via: "test",
  })
  // tg opens this task when it syncs; memo reads the same store.
  await applyTaskRulesToStored(store, key)
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return { out: streams.stdout.join(""), json: () => JSON.parse(streams.stdout.join("")) }
  }
  return { env, run }
}

it("**mounts tg's tasks agenda, plan, show and stats tasks show** with the account named on the command", async () => {
  const { run } = await setUp()

  const agenda = (await run("tasks", "agenda", ...scope, "--json")).json()
  expect(agenda.item.tasks).toHaveLength(1)
  const task = agenda.item.tasks[0].key
  expect(
    (await run("tasks", "plan", task, "--title", "Hand over the keys", "--due", "2d", ...scope, "--json")).json(),
  ).toMatchObject({ item: { title: "Hand over the keys" } })
  expect((await run("tasks", "show", task, ...scope, "--json")).json()).toMatchObject({
    item: { key: task, title: "Hand over the keys" },
  })
  expect((await run("stats", "tasks", "show", ...scope, "--json")).json().item).toMatchObject({ open: 1 })
})

it("refuses a shared task command that names no account, and lists the ones the store holds", async () => {
  const { run } = await setUp()

  await expect(run("tasks", "agenda", "--json")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("--provider telegram --account 500"),
  })
})
