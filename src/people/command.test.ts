import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import type { Message } from "@leemour/cli-messaging"
import { openStore } from "@leemour/cli-messaging/store"
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

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "people-"))
  env = { ...process.env, MESSAGING_STORE: join(dir, "messages.db"), MEMO_CONFIG_DIR: join(dir, "config") }
  const store = await openStore({ env })
  const tg = { provider: "telegram", account: "1" }
  const mail = { provider: "email", account: "owner@example.test" }
  await store.saveMessages(tg, "chat-101", [message("1", "101", "Rin Example")], { via: "test" })
  await store.saveMessages(tg, "chat-102", [message("2", "102", "Kai Sample")], { via: "test" })
  await store.saveMessages(tg, "chat-103", [message("3", "103", "Kai Sample")], { via: "test" })
  await store.saveMessages(mail, "t1", [message("m1", "rin@example.test", "Rin Example")], { via: "test" })
  await store.close()
})

describe("memo link", () => {
  it("joins a Telegram identity and a mail address into one person", async () => {
    const linked = JSON.parse(await run("link", "telegram:Rin Example", "email:RIN@example.test", "--json"))

    expect(
      linked.identities.map(({ provider, id }: { provider: string; id: string }) => `${provider}:${id}`).sort(),
    ).toEqual(["email:rin@example.test", "telegram:101"])
    expect(linked.identities[0]).toMatchObject({ method: "manual", linkedBy: "owner" })
  })

  it("refuses a name two people share, and takes either by id", async () => {
    await expect(run("link", "telegram:Kai Sample", "email:rin@example.test")).rejects.toThrow("matches 2 people")

    const text = await run("link", "telegram:102", "email:rin@example.test")

    expect(text).toContain("telegram:102")
    expect(text).not.toContain("telegram:103")
  })

  it("asks for the messenger when a reference has none", async () => {
    await expect(run("link", "Rin Example", "email:rin@example.test")).rejects.toThrow("names no messenger")
  })

  it("takes an identity back out with unlink", async () => {
    await run("link", "telegram:101", "email:rin@example.test")

    const person = JSON.parse(await run("unlink", "email:rin@example.test", "--json"))

    expect(person.identities.map(({ id }: { id: string }) => id)).toEqual(["rin@example.test"])
  })
})

describe("memo note", () => {
  it("keeps the note for the person, whichever of their identities names them", async () => {
    await run("link", "telegram:101", "email:rin@example.test")

    await run("note", "telegram:101", "/notes/people/Rin Example.md")

    expect(await run("note", "email:rin@example.test")).toBe("Rin Example: /notes/people/Rin Example.md\n")
    expect(await run("note", "email:rin@example.test", "--clear")).toBe("Rin Example: no note\n")
  })
})
