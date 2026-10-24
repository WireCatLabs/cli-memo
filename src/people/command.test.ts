import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

const message = (id: string, senderId: string, senderName: string): Message => ({
  id,
  chatId: `chat-${senderId}`,
  senderId,
  senderName,
  timestamp: "2026-09-10T08:00:00Z",
  editedAt: null,
  text: "synthetic",
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

let env: NodeJS.ProcessEnv
let vault: string

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "people-"))
  env = {
    ...process.env,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
  }
  vault = join(dir, "vault")
  mkdirSync(join(vault, "people"), { recursive: true })
  writeFileSync(join(vault, "people", "Rin Example.md"), "Works on the lighthouse.\n")
  const store = await openStore({ env })
  const tg = { provider: "telegram", account: "1" }
  const mail = { provider: "email", account: "owner@example.test" }
  await store.messages.saveMessages(tg, "chat-101", [message("1", "101", "Rin Example")], { via: "test" })
  await store.messages.saveMessages(tg, "chat-102", [message("2", "102", "Kai Sample")], { via: "test" })
  await store.messages.saveMessages(tg, "chat-103", [message("3", "103", "Kai Sample")], { via: "test" })
  await store.messages.saveMessages(mail, "t1", [message("m1", "rin@example.test", "Rin Example")], { via: "test" })
  await store.close()
})

describe("memo note", () => {
  it("asks for the messenger when a reference has none", async () => {
    await expect(run("notes", "links", "show", "Rin Example")).rejects.toThrow("names no messenger")
  })

  it("refuses a name two people share", async () => {
    await expect(run("notes", "links", "add", "telegram:Kai Sample", join(vault, "kai.md"))).rejects.toThrow(
      "matches 2 people",
    )
  })

  it("keeps the note for the person, whichever of their identities names them", async () => {
    const store = await openStore({ env })
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "email", id: "rin@example.test" },
      { method: "manual", by: "owner" },
    )
    await store.close()
    await run("folders", "add", vault)
    await run("sync", "--only", "notes")

    await run("notes", "links", "add", "telegram:101", join(vault, "people", "Rin Example.md"), "--json")

    expect(await run("notes", "links", "show", "email:rin@example.test")).toBe(
      `Rin Example: ${join(vault, "people", "Rin Example.md")}\n`,
    )
    expect(JSON.parse(await run("notes", "links", "show", "email:rin@example.test", "--json=files"))).toMatchObject({
      item: { files: [join(vault, "people", "Rin Example.md")] },
    })
    expect(await run("notes", "links", "clear", "email:rin@example.test")).toBe("Rin Example: no note\n")
    expect(JSON.parse(await run("notes", "links", "clear", "email:rin@example.test", "--json"))).toMatchObject({
      item: { files: [] },
    })
  })

  it("moves the old people-notes.json into the store once the note is imported", async () => {
    const store = await openStore({ env })
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    await store.close()
    mkdirSync(env.MEMO_CONFIG_DIR as string, { recursive: true })
    writeFileSync(
      join(env.MEMO_CONFIG_DIR as string, "people-notes.json"),
      JSON.stringify({
        [uid]: join(vault, "people", "Rin Example.md"),
        "01JOLDSTOREPERSON0000000000": join(vault, "people", "Rin Example.md"),
      }),
    )
    await run("folders", "add", vault)
    expect(await run("notes", "links", "show", "telegram:101")).toBe("Rin Example: no note\n")

    await run("sync", "--only", "notes")

    expect(await run("notes", "links", "show", "telegram:101")).toBe(
      `Rin Example: ${join(vault, "people", "Rin Example.md")}\n`,
    )
    await run("notes", "links", "clear", "telegram:101")
    await run("sync", "--only", "notes")
    expect(await run("notes", "links", "show", "telegram:101")).toBe("Rin Example: no note\n")
  })
})
