import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Chat, Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
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
  writeFileSync(join(vault, "Meeting.md"), "Kickoff.\n[[Rin Example]] will send the budget.\n")
  writeFileSync(join(vault, "Call.md"), "Called [[person:PLACEHOLDER]] about Friday.\nRin Example sounded busy.\n")
  env = {
    ...process.env,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
  }

  const store = await openStore({ env })
  await store.sync.applyDelta(tg, { chats: [chat("101", "Rin Example")], people: [{ id: "101", name: "Rin Example" }] })
  await store.messages.saveMessages(
    tg,
    "101",
    [
      message("1", "101", "101", false, "Are we still on for Friday?", "2026-09-10T08:00:00Z"),
      message("2", "101", "999", true, "Yes, see you then.", "2026-09-10T09:00:00Z"),
    ],
    { via: "test" },
  )
  await store.roster.saveMembers(tg, "101", ["101", "999"])
  await store.sync.applyDelta(mail, { chats: [chat("t1", "Budget")] })
  await store.messages.saveMessages(
    mail,
    "t1",
    [message("m1", "t1", "rin@example.test", false, "Budget attached.", "2026-09-11T08:00:00Z")],
    { via: "test" },
  )
  await store.close()
})

describe("memo context", () => {
  it("finds direct messages in a private dialog without recorded members", async () => {
    const store = await openStore({ env })
    await store.roster.saveMembers(tg, "101", [])
    await store.close()

    const answer = answerOf(await run("context", "telegram:101", "--json"))

    expect(answer.messages.last.from_them?.id).toBe("1")
    expect(answer.messages.last.from_me?.id).toBe("2")
    expect(answer.messages.recent.direct.map(({ id }: { id: string }) => id)).toEqual(["2", "1"])
  })

  it("joins messages, linked mail and notes about one person", async () => {
    const store = await openStore({ env })
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "email", id: "rin@example.test" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    await store.close()
    writeFileSync(join(vault, "Call.md"), `Called [[person:${uid}]] about Friday.\nRin Example sounded busy.\n`)
    await run("folders", "add", vault)
    await run("sync", "--only", "notes")
    await run("notes", "links", "add", "telegram:101", join(vault, "People", "Rin Example.md"))
    await run("notes", "add", "Prefers mornings", "--subject", "email:rin@example.test")

    const answer = answerOf(await run("context", "telegram:Rin Example", "--json"))

    expect(answer.messages.person.identities.map(({ provider }: { provider: string }) => provider).sort()).toEqual([
      "email",
      "telegram",
    ])
    expect(answer.messages.last.from_them.text).toBe("Are we still on for Friday?")
    expect(answer.messages.last.from_them_anywhere.text).toBe("Budget attached.")
    expect(answer.messages.last.from_me.text).toBe("Yes, see you then.")
    expect(answer.notes.about.map(({ path }: { path: string }) => path)).toEqual(["People/Rin Example.md"])
    expect(answer.notes.linking.map(({ path }: { path: string }) => path)).toEqual(["Call.md"])
    expect(answer.notes.through_notes.map(({ path }: { path: string }) => path)).toEqual(["Meeting.md"])
    expect(answer.your_notes.map(({ text }: { text: string }) => text)).toEqual(["Prefers mornings"])
    expect(answer.not_read).toEqual([])
  })

  it("says which sources gave nothing, and why", async () => {
    const answer = answerOf(await run("context", "telegram:101", "--json"))

    expect(answer.not_read.map(({ source }: { source: string }) => source)).toEqual(["notes", "mail"])
  })

  it("prints a readable answer, naming the person, each message and each note by a reference memo takes", async () => {
    const added = answerOf(await run("notes", "add", "Prefers mornings", "--subject", "telegram:101", "--json"))
    const text = await run("context", "telegram:101")

    expect(text).toContain("Last from them")
    expect(text).toContain("Are we still on for Friday?")
    expect(text.split("\n")[0]).toMatch(/ {2}person:\d+$/)
    expect(text).toMatch(/Are we still on for Friday\? {2}msg:telegram\/1\/101\/1/)
    expect(text).toContain(`  ${added.ref}  Prefers mornings`)

    const listed = await run("notes", "list", "source:internal")
    expect(listed).toContain(`${added.ref}  internal`)
    const shown = (await run("notes", "show", added.ref)).split("\n")
    expect(shown[0]).toBe(added.ref)
    expect(shown).toContain("Prefers mornings")
  })

  it("asks for the messenger, and names a messenger the store does not hold", async () => {
    await expect(run("context", "Rin Example")).rejects.toThrow("names no messenger")
    await expect(run("context", "max:Rin")).rejects.toThrow("no max account")
  })
})
