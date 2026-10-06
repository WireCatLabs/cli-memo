import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import type { Chat, Message } from "@leemour/cli-messaging"
import { openStore } from "@leemour/cli-messaging/store"
import { beforeEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

const tg = { provider: "telegram", account: "1" }
const mail = { provider: "email", account: "owner@example.test" }

const message = (
  id: string,
  chatId: string,
  senderId: string,
  outgoing: boolean,
  text: string,
  at: string,
): Message => ({
  id,
  chatId,
  senderId,
  senderName: outgoing ? "Owner" : "Rin Example",
  timestamp: at,
  editedAt: null,
  text,
  outgoing,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const chat = (id: string, title: string): Chat => ({
  id,
  title,
  kind: "dialog",
  unreadCount: null,
  lastMessageAt: "2026-09-12T08:00:00Z",
  participantsCount: 2,
})

let env: NodeJS.ProcessEnv
let vault: string

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "context-"))
  vault = join(dir, "vault")
  mkdirSync(join(vault, "People"), { recursive: true })
  writeFileSync(join(vault, "People", "Rin Example.md"), "Works on the lighthouse.\n")
  writeFileSync(join(vault, "Meeting.md"), "Kickoff.\nRin Example will send the budget.\n")
  env = { ...process.env, MESSAGING_STORE: join(dir, "messages.db"), MEMO_CONFIG_DIR: join(dir, "config") }

  const store = await openStore({ env })
  await store.applyDelta(tg, { chats: [chat("101", "Rin Example")], people: [{ id: "101", name: "Rin Example" }] })
  await store.saveMessages(
    tg,
    "101",
    [
      message("1", "101", "101", false, "Are we still on for Friday?", "2026-09-10T08:00:00Z"),
      message("2", "101", "999", true, "Yes, see you then.", "2026-09-10T09:00:00Z"),
    ],
    { via: "test" },
  )
  await store.saveMembers(tg, "101", ["101", "999"])
  await store.applyDelta(mail, { chats: [chat("t1", "Budget")] })
  await store.saveMessages(
    mail,
    "t1",
    [message("m1", "t1", "rin@example.test", false, "Budget attached.", "2026-09-11T08:00:00Z")],
    { via: "test" },
  )
  await store.close()
})

describe("memo context", () => {
  it("joins messages, linked mail and notes about one person", async () => {
    const store = await openStore({ env })
    await store.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "email", id: "rin@example.test" },
      { method: "manual", by: "owner" },
    )
    await store.close()
    await run("notes", "import", "--folder", vault)
    await run("note", "telegram:101", join(vault, "People", "Rin Example.md"))

    const answer = JSON.parse(await run("context", "telegram:Rin Example", "--json"))

    expect(answer.messages.person.identities.map(({ provider }: { provider: string }) => provider).sort()).toEqual([
      "email",
      "telegram",
    ])
    expect(answer.messages.last.fromThem.text).toBe("Are we still on for Friday?")
    expect(answer.messages.last.fromThemAnywhere.text).toBe("Budget attached.")
    expect(answer.messages.last.fromMe.text).toBe("Yes, see you then.")
    expect(answer.notes.about).toBe(join(vault, "People", "Rin Example.md"))
    expect(answer.notes.mentions).toEqual([
      expect.objectContaining({ path: "Meeting.md", line: "Rin Example will send the budget." }),
    ])
    expect(answer.notRead).toEqual([])
  })

  it("says which sources gave nothing, and why", async () => {
    const answer = JSON.parse(await run("context", "telegram:101", "--json"))

    expect(answer.notRead.map(({ source }: { source: string }) => source)).toEqual(["notes", "mail"])
  })

  it("prints a readable answer", async () => {
    const text = await run("context", "telegram:101")

    expect(text).toContain("Last from them")
    expect(text).toContain("Are we still on for Friday?")
  })

  it("asks for the messenger, and names a messenger the store does not hold", async () => {
    await expect(run("context", "Rin Example")).rejects.toThrow("names no messenger")
    await expect(run("context", "max:Rin")).rejects.toThrow("no max account")
  })
})
