import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { formatLocator } from "@leemour/cli-messaging"
import { openStore } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

describe("Memo annotations and explicit tasks", () => {
  it("authors private annotations without editing sources and keeps closed document tasks closed", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-annotation-")),
      env = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
    const key = { provider: "notes", account: "synthetic-vault" }
    const store = await openStore({ env })
    await store.saveChats(key, [
      { id: ".", title: "Vault", kind: "saved", unreadCount: 0, lastMessageAt: null, participantsCount: null },
    ])
    await store.saveMessages(
      key,
      ".",
      [
        {
          id: "plan.md",
          chatId: ".",
          senderId: null,
          senderName: null,
          text: "Original source",
          timestamp: "2026-10-08T00:00:00Z",
          editedAt: null,
          outgoing: true,
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
      await createProgram({ streams, env })
        .exitOverride()
        .parseAsync([...args, "--json"], { from: "user" })
      return JSON.parse(streams.stdout.join(""))
    }
    const locator = formatLocator({ ...key, chat: ".", message: "plan.md" })
    const note = await run("annotations", "add", "--message", locator, "--text", "My own assessment")
    const scope = ["--provider", key.provider, "--account", key.account]
    expect(note).toMatchObject({ authoredBy: "owner", targetState: "available", revision: 1 })
    expect(
      await run("annotations", "edit", note.id, ...scope, "--revision", "1", "--text", "Revised assessment"),
    ).toMatchObject({ revision: 2 })
    await expect(
      run("annotations", "edit", note.id, ...scope, "--revision", "1", "--text", "Stale"),
    ).rejects.toMatchObject({ code: "validation_error" })
    expect((await run("annotations", "list", ...scope, "--search", "Revised")).items).toHaveLength(1)
    const added = await run("tasks", "add", locator)
    expect((await run("tasks", "add", locator)).created).toBe(false)
    await run("tasks", "close", added.task.id, ...scope)
    expect((await run("tasks", "add", locator)).task.state).toBe("done")
    const reopened = await openStore({ env })
    expect((await reopened.message(key, "plan.md", { chatId: "." }))?.text).toBe("Original source")
    await reopened.markDeleted(key, ["plan.md"], { chatId: "." })
    await reopened.close()
    expect(await run("annotations", "show", note.id, ...scope)).toMatchObject({
      targetState: "deleted",
      text: "Revised assessment",
    })
  })
})
