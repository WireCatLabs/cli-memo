import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { formatLocator } from "@leemour/cli-messaging"
import { openStore } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

describe("combined evidence, relationships and local reminders", () => {
  it("keeps shared-group tasks unrelated unless assigned, exposes source evidence, and delivers a local reminder once acknowledged", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-context-work-")),
      env = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
    const key = { provider: "telegram", account: "1" },
      notes = { provider: "notes", account: "synthetic-vault" }
    const store = await openStore({ env })
    const chat = (id: string, kind: "dialog" | "group" | "saved") => ({
      id,
      kind,
      title: "Synthetic",
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: null,
    })
    const message = (id: string, chatId: string, senderId: string | null, text: string) => ({
      id,
      chatId,
      senderId,
      senderName: null,
      timestamp: "2026-10-08T00:00:00Z",
      editedAt: null,
      text,
      outgoing: senderId === "1" || senderId === null,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    })
    await store.applyDelta(key, {
      chats: [chat("101", "dialog"), chat("77", "group")],
      people: [
        { id: "101", name: "Rin Synthetic" },
        { id: "202", name: "Kai Synthetic" },
      ],
      members: new Map([
        ["101", ["1", "101"]],
        ["77", ["1", "101", "202"]],
      ]),
    })
    await store.saveMessages(key, "101", [message("1", "101", "101", "Synthetic budget")], { via: "test" })
    await store.saveMessages(
      key,
      "77",
      [message("2", "77", "202", "Unrelated budget"), message("3", "77", "101", "Rin budget request")],
      { via: "test" },
    )
    await store.saveChats(notes, [chat(".", "saved")])
    await store.saveMessages(notes, ".", [message("plan.md", ".", null, "Synthetic budget document")], { via: "test" })
    const person = await store.personOf({ provider: key.provider, id: "101" })
    const legacy = await store.addContactNote(key, "101", "Existing private assessment")
    await store.close()
    const run = async (...args: string[]) => {
      const streams = captureStreams()
      await createProgram({ streams, env })
        .exitOverride()
        .parseAsync([...args, "--json"], { from: "user" })
      return JSON.parse(streams.stdout.join(""))
    }
    const source = (account: typeof key, chat: string, message: string) => formatLocator({ ...account, chat, message })
    const direct = await run("tasks", "add", source(key, "101", "1"))
    const unrelated = await run("tasks", "add", source(key, "77", "2"))
    const participating = await run("tasks", "add", source(key, "77", "3"))
    const document = await run("tasks", "add", source(notes, ".", "plan.md"))
    const scope = ["--provider", key.provider, "--account", key.account],
      noteScope = ["--provider", notes.provider, "--account", notes.account]
    await run("tasks", "assign", document.task.id, person?.uid as string, ...noteScope)
    const context = await run("context", "telegram:101")
    expect(context.tasks.items.map((task: { id: string }) => task.id).sort()).toEqual(
      [direct.task.id, participating.task.id, document.task.id].sort(),
    )
    expect(context.tasks.items.some((task: { id: string }) => task.id === unrelated.task.id)).toBe(false)
    expect(context.annotations.items.map((note: { id: string }) => note.id)).toContain(legacy.id)
    const entity = await run("entities", "add", "Synthetic Studio", "--kind", "organization", ...scope)
    await run("relationships", "add", `person:${person?.uid}`, `entity:${entity.id}`, ...scope)
    expect((await run("context", "telegram:101")).relationships).toHaveLength(1)
    const annotation = await run(
      "annotations",
      "add",
      "--message",
      source(notes, ".", "plan.md"),
      "--text",
      "Owner budget analysis",
    )
    await run("tags", "add", "project", "--task", document.task.id, ...noteScope)
    expect((await run("tags", "list", "--tag", "project", ...noteScope)).knowledge[0].target).toMatchObject({
      type: "task",
      id: document.task.id,
    })
    const searched = await run("search", "budget", "--all", "--annotation-text", "budget", "--limit", "100")
    expect(searched.items.some((item: { kind: string }) => item.kind === "task")).toBe(true)
    expect(searched.items.some((item: { locator: string }) => item.locator.endsWith(annotation.id))).toBe(true)
    const bundle = await run("ask", "What is pending?", "--query", "budget", "--all")
    expect(bundle.evidence.length).toBeGreaterThan(0)
    const reminder = await run("reminders", "schedule", document.task.id, "--at", "2026-01-01T00:00:00Z", ...noteScope)
    const [delivery] = await run("reminders", "poll", ...noteScope)
    expect(delivery.deliveryId).toBe(`${reminder.id}:1`)
    expect(await run("reminders", "poll", ...noteScope)).toEqual([])
    await run("reminders", "ack", reminder.id, delivery.receipt, ...noteScope)
    expect(await run("reminders", "poll", ...noteScope)).toEqual([])
    const second = await openStore({ env })
    await second.saveAccount({ ...key, account: "2" }, { name: null })
    await second.close()
    await expect(run("context", "telegram:101")).rejects.toMatchObject({ code: "validation_error" })
    expect((await run("context", "telegram:101", "--account", "1")).tasks.items).toHaveLength(3)
  })
})
