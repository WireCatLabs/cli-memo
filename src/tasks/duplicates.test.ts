import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { formatLocator } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("attaches the source to a task or opens a new one when told to, as cli-core's duplicate check asks", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-duplicates-")), "store.db") }
  const key = { provider: "telegram", account: "1" }
  const store = await openStore({ env })
  await store.applyDelta(key, {
    chats: [
      { id: "101", kind: "dialog", title: "Synthetic", unreadCount: 0, lastMessageAt: null, participantsCount: null },
    ],
    people: [{ id: "101", name: "Rin Synthetic" }],
    members: new Map([["101", ["1", "101"]]]),
  })
  const message = (id: string) => ({
    id,
    chatId: "101",
    senderId: "101",
    senderName: null,
    timestamp: `2026-10-08T00:00:0${id}Z`,
    editedAt: null,
    text: "Please send the quarterly budget report by Friday",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  })
  await store.saveMessages(key, "101", ["1", "2", "3"].map(message), { via: "test" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const source = (id: string) => formatLocator({ ...key, chat: "101", message: id })

  const first = await run("tasks", "add", source("1"))
  const attached = await run("tasks", "add", source("2"), "--into", first.task.id)
  expect(attached).toMatchObject({ created: false, attached: true, task: { id: first.task.id } })
  const opened = await run("tasks", "add", source("3"), "--new")
  expect(opened.created).toBe(true)
  expect(opened.task.id).not.toBe(first.task.id)
  await expect(run("tasks", "add", "--project", "HRB", "--title", "Example", "--new")).rejects.toMatchObject({
    code: "validation_error",
  })
})
