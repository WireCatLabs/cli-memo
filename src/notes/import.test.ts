import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import { beforeEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

let env: NodeJS.ProcessEnv
let vault: string

const write = (path: string, text: string) => {
  mkdirSync(join(vault, path, ".."), { recursive: true })
  writeFileSync(join(vault, path), text)
}

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

const json = async (...args: string[]) => JSON.parse(await run(...args, "--json"))

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "notes-store-"))
  vault = join(dir, "vault")
  env = { ...process.env, MESSAGING_STORE: join(dir, "messages.db"), MEMO_CONFIG_DIR: join(dir, "config") }
  write("People/Rin Example.md", "---\naliases: [Rin]\n---\nWorks on the lighthouse project.\n")
  write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]] and [[Kai Sample]].\nBudget is open.\n")
  write("Projects/Harbour.md", "Harbour plan, with [[Kai Sample]].\n")
  write("Psychology/Private Notes.md", "lighthouse dreams\n")
})

describe("memo notes import and search", () => {
  it("finds stored notes by their words and lists who they link", async () => {
    await run("notes", "import", "--folder", vault)

    const result = await json("notes", "search", "lighthouse")

    expect(result.hits.map(({ path }: { path: string }) => path).sort()).toEqual([
      "People/Rin Example.md",
      "Projects/Lighthouse.md",
      "Psychology/Private Notes.md",
    ])
    expect(result.linked).toEqual([
      { name: "Kai Sample", notes: 1, person: null },
      { name: "Rin Example", notes: 1, person: null },
    ])
  })

  it("never stores an ignored note, and drops one ignored after it was stored", async () => {
    await run("notes", "import", "--folder", vault)

    await run("notes", "import", "--folder", vault, "--ignore", "Psychology/Private Notes.md")

    const result = await json("notes", "search", "dreams")
    expect(result.hits).toEqual([])
  })

  it("keeps an edited note's new text searchable, and drops a deleted one", async () => {
    await run("notes", "import", "--folder", vault)
    write("Projects/Harbour.md", "Harbour plan moved to the marina.\n")
    rmSync(join(vault, "Projects/Lighthouse.md"))

    const imported = await json("notes", "import", "--folder", vault)

    expect(imported[0]).toMatchObject({ notes: 3, deleted: 1 })
    expect((await json("notes", "search", "marina")).hits).toHaveLength(1)
    expect((await json("notes", "search", "kickoff")).hits).toEqual([])
  })

  it("stores each note once however often it runs", async () => {
    await run("notes", "import", "--folder", vault)
    await run("notes", "import", "--folder", vault)

    const store = await openStore({ env })
    const found = await store.find({ provider: "notes", text: "harbour", limit: 10 })
    await store.close()
    expect(found.items).toHaveLength(1)
  })

  it("names people the store knows when their full name is in a note found, as a guess", async () => {
    write("Projects/Harbour.md", "Harbour plan: call Kai Sample and Kai.\n")
    await run("notes", "import", "--folder", vault)
    const store = await openStore({ env })
    await store.savePeople({ provider: "telegram", account: "1" }, [
      { id: "102", name: "Kai Sample" },
      { id: "103", name: "Kai" },
    ])
    await store.close()

    const result = await json("notes", "search", "harbour")

    expect(result.mentioned).toEqual([{ provider: "telegram", id: "102", name: "Kai Sample", notes: 1 }])
  })

  it("names the person a linked note belongs to, once memo note says so", async () => {
    await run("notes", "import", "--folder", vault)
    const store = await openStore({ env })
    const tg = { provider: "telegram", account: "1" }
    await store.saveMessages(
      tg,
      "c1",
      [
        {
          id: "1",
          chatId: "c1",
          senderId: "101",
          senderName: "Rin Example",
          timestamp: "2026-09-10T08:00:00Z",
          editedAt: null,
          text: "hi",
          outgoing: false,
          attachments: [],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "test" },
    )
    const uid = (await store.personOf({ provider: "telegram", id: "101" }))?.uid
    await store.close()
    await run("note", "telegram:101", join(vault, "People/Rin Example.md"))

    const result = await json("notes", "search", "kickoff")

    expect(result.linked).toContainEqual({ name: "Rin Example", notes: 1, person: uid })
  })
})
