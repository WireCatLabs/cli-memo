import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Chat, Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const tg = { provider: "telegram", account: "1" }

it("hides a task inbox from the project list unless the query names kind", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-inbox-")), "fixture.db") }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const store = await openStore({ env })
  const chat: Chat = {
    id: "101",
    title: "Rin Example",
    kind: "dialog",
    unreadCount: null,
    lastMessageAt: "2026-09-10T08:00:00Z",
    participantsCount: 2,
  }
  const message: Message = {
    id: "1",
    chatId: "101",
    senderId: "101",
    senderName: "Rin Example",
    timestamp: "2026-09-10T08:00:00Z",
    editedAt: null,
    text: "Send the budget",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }
  await store.sync.applyDelta(tg, { chats: [chat], people: [{ id: "101", name: "Rin Example" }] })
  await store.messages.saveMessages(tg, "101", [message], { via: "test" })
  await store.close()

  await run("projects", "add", "Research Example", "--key", "RES")
  await run("tasks", "add", "msg:telegram/1/101/1", "--account", "telegram:1")

  const visible = await run("projects", "list")
  expect(visible.items.map(({ key }: { key: string }) => key)).toEqual(["RES"])
  const inbox = (await run("projects", "list", "kind:inbox")).items
  expect(inbox.map(({ kind }: { kind: string }) => kind)).toEqual(["inbox"])
})
