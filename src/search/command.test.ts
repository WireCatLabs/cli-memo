import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

it("searches three typed resources together, separates mail and messages, and filters native note/message types", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-resources-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  const message = {
    id: "1",
    chatId: "7",
    senderId: "9",
    senderName: null,
    timestamp: "2026-10-09T00:00:00Z",
    editedAt: null,
    text: "Sharedsignal synthetic",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }
  await store.saveMessages({ provider: "telegram", account: "1" }, "7", [message], { via: "test" })
  await store.saveMessages({ provider: "email", account: "mailbox" }, "7", [message], { via: "test" })
  const internal = await store.notes.addNote({ text: "Sharedsignal internal" })
  const folder = await store.notes.addFolder({ name: "Unbound synthetic folder" })
  const file = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "plan.md",
    title: "Plan",
    text: "Sharedsignal file",
  })
  await store.saveAccount({ provider: "notes", account: "synthetic-legacy" }, { name: null })
  await store.tasks.insert({
    id: "legacy-note-task",
    source: `note:${file.note.id}`,
    sourceKind: "note",
    account: "notes:synthetic-legacy",
    group: `note:${file.note.id}`,
    kind: "request",
    state: "open",
    origin: "owner",
    createdAt: new Date("2026-10-09T00:00:00Z"),
  })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    const override = (command: Command) => {
      command.exitOverride()
      command.configureOutput({ writeErr: () => {} })
      for (const child of command.commands) override(child)
    }
    override(program)
    await program.parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  const all = await run("search", "all", "Sharedsignal", "--exact")
  expect(all.tasks.map((task: { id: string }) => task.id)).toEqual(["legacy-note-task"])
  expect(all.items.map((item: { kind: string }) => item.kind).sort()).toEqual(["mail", "message", "note", "note"])
  expect(all.items.map((item: { ref: string }) => item.ref)).toEqual(
    expect.arrayContaining([`note:${internal.id}`, `note:${file.note.id}`]),
  )
  expect(
    (await run("search", "messages", "Sharedsignal")).items.map((item: { locator: string }) => item.locator),
  ).toEqual(["msg:telegram/1/7/1"])
  await expect(run("search", "messages", "Sharedsignal AND in:email")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("search mail"),
  })
  expect((await run("search", "mail", "Sharedsignal")).items.map((item: { locator: string }) => item.locator)).toEqual([
    "msg:email/mailbox/7/1",
  ])
  expect((await run("search", "messages", "Sharedsignal", "--type", "text")).items).toHaveLength(1)
  expect((await run("search", "messages", "Sharedsignal", "--type", "file")).items).toEqual([])
  expect(
    (await run("search", "notes", "Sharedsignal", "--type", "internal")).hits.map((hit: { ref: string }) => hit.ref),
  ).toEqual([`note:${internal.id}`])
  expect(
    (await run("search", "notes", "Sharedsignal", "--folder", folder.id)).hits.map((hit: { ref: string }) => hit.ref),
  ).toEqual([`note:${file.note.id}`])
  for (const args of [
    ["search", "Sharedsignal"],
    ["notes", "search", "Sharedsignal"],
    ["search", "all", "Sharedsignal", "--all"],
    ["search", "notes", "Sharedsignal", "--source", "file"],
  ])
    await expect(run(...args)).rejects.toHaveProperty("code")
})
