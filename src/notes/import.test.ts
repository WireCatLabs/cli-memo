import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import type { Message } from "@leemour/cli-messaging"
import { openStore } from "@leemour/cli-messaging/store"
import { beforeEach, describe, expect, it } from "vitest"
import { configPath } from "../config.js"
import { createProgram } from "../program.js"

let env: NodeJS.ProcessEnv
let root: string
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

const telegramPeople = async (...people: [string, string][]) => {
  const store = await openStore({ env })
  for (const [id, name] of people)
    await store.saveMessages({ provider: "telegram", account: "1" }, `chat-${id}`, [message(id, id, name)], {
      via: "test",
    })
  await store.close()
}

const paths = (hits: { path: string }[]) => hits.map(({ path }) => path).sort()

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "notes-store-"))
  vault = join(root, "vault")
  env = {
    ...process.env,
    MESSAGING_STORE: join(root, "messages.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  write("People/Rin Example.md", "---\naliases: [Rin]\n---\nWorks on the lighthouse project.\n")
  write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]] and [[Kai Sample]].\nBudget is open. #work\n")
  write("Projects/Harbour.md", "Harbour plan, with [[Kai Sample]].\n")
  write("Psychology/Private Notes.md", "lighthouse dreams\n")
  await run("folders", "add", vault)
})

describe("memo notes import", () => {
  it("refuses a folder with no id, naming both ways to give it one", async () => {
    writeFileSync(configPath(env), JSON.stringify({ notes: { folders: [join(root, "elsewhere")] } }))
    await expect(run("notes", "import")).rejects.toThrow(/memo folders add .*memo folders attach/)
  })

  it("finds stored notes by their words and lists what they link", async () => {
    await run("notes", "import")

    const result = await json("notes", "search", "lighthouse")

    expect(paths(result.hits)).toEqual([
      "People/Rin Example.md",
      "Projects/Lighthouse.md",
      "Psychology/Private Notes.md",
    ])
    expect(result.linked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Rin Example", notes: 1 }),
        { ref: null, name: "Kai Sample", notes: 1 },
      ]),
    )
  })

  it("never stores an ignored note, and drops one ignored after it was stored", async () => {
    await run("notes", "import")

    await run("notes", "import", "--ignore", "Psychology/Private Notes.md")

    expect((await json("notes", "search", "dreams")).hits).toEqual([])
  })

  it("keeps an edited note's new text searchable, and drops a deleted one", async () => {
    await run("notes", "import")
    write("Projects/Harbour.md", "Harbour plan moved to the quay.\n")
    utimesSync(join(vault, "Projects/Harbour.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    rmSync(join(vault, "Psychology/Private Notes.md"))

    const second = await json("notes", "import")

    expect(second[0]).toMatchObject({ changed: 1, deleted: 1 })
    expect(paths((await json("notes", "search", "quay")).hits)).toEqual(["Projects/Harbour.md"])
    expect((await json("notes", "search", "dreams")).hits).toEqual([])
  })

  it("saves only what changed since the last run", async () => {
    expect((await json("notes", "import"))[0]).toMatchObject({ notes: 4, changed: 4 })
    expect((await json("notes", "import"))[0]).toMatchObject({ notes: 4, changed: 0 })
  })

  it("refuses to drop most notes at once, and weighs them again next run", async () => {
    for (const name of ["a", "b", "c", "d", "e", "f"]) write(`Bulk/${name}.md`, `bulk ${name}\n`)
    await run("notes", "import")
    rmSync(join(vault, "Bulk"), { recursive: true })
    rmSync(join(vault, "Projects"), { recursive: true })

    const refused = await json("notes", "import")

    expect(refused[0].deletionsSkipped).toMatch(/too many to trust/)
    expect(paths((await json("notes", "search", "bulk")).hits)).toHaveLength(6)
    expect((await json("notes", "import"))[0].deletionsSkipped).toMatch(/too many to trust/)
  })

  it("keeps a moved note's id, its links and its tags", async () => {
    await telegramPeople(["101", "Owner Example"])
    await run("notes", "import")
    const before = await json("notes", "show", join(vault, "Projects/Lighthouse.md"))
    renameSync(join(vault, "Projects/Lighthouse.md"), join(vault, "Projects/Beacon.md"))

    expect((await json("notes", "import"))[0]).toMatchObject({ renamed: 1, deleted: 0 })

    const after = await json("notes", "show", `note:${before.id}`)
    expect(after).toMatchObject({ path: "Projects/Beacon.md", tags: ["work"] })
    expect(after.links).toHaveLength(2)
  })

  it("stores a file's tags and drops one the file no longer has", async () => {
    await telegramPeople(["101", "Owner Example"])
    await run("notes", "import")
    expect((await json("notes", "search", "budget", "--tag", "work")).hits).toHaveLength(1)

    write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]].\nBudget is open.\n")
    utimesSync(join(vault, "Projects/Lighthouse.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    await run("notes", "import")

    expect((await json("notes", "search", "budget", "--tag", "work")).hits).toEqual([])
  })

  it("does not import a note memo exported", async () => {
    write("Inbox/From memo.md", "---\nmemo-id: 01SYNTHETIC\nmemo-hash: x\n---\nexported lighthouse\n")

    await run("notes", "import")

    expect(paths((await json("notes", "search", "exported")).hits)).toEqual([])
  })

  it("links a name no note has to the person, the moment someone by that name appears", async () => {
    await run("notes", "import")
    expect((await json("notes", "about", "person:nobody")).linking).toEqual([])

    await telegramPeople(["102", "Kai Sample"])

    const about = await json("notes", "about", "telegram:Kai Sample")
    expect(paths(about.linking)).toEqual(["Projects/Harbour.md", "Projects/Lighthouse.md"])
  })

  it("names the note about a person, and the notes linking that note", async () => {
    await telegramPeople(["101", "Rin Example"])
    await run("notes", "import")

    await run("note", "telegram:101", join(vault, "People/Rin Example.md"))

    const about = await json("notes", "about", "telegram:Rin Example")
    expect(paths(about.about)).toEqual(["People/Rin Example.md"])
    expect(paths(about.throughNotes)).toEqual(["Projects/Lighthouse.md"])
  })
})

describe("notes written in memo", () => {
  it("adds, edits, lists and removes a note about a person, and exports it once", async () => {
    await telegramPeople(["101", "Rin Example"])
    const out = join(root, "exported")
    const id = (await run("notes", "add", "Prefers mornings", "--about", "telegram:Rin Example")).trim()

    expect(
      (await json("notes", "list", "--about", "telegram:101")).items.map((note: { id: string }) => note.id),
    ).toEqual([id])
    const edited = await json(
      "notes",
      "edit",
      id,
      "--revision",
      "1",
      "--text",
      "Prefers early mornings",
      "--export",
      out,
    )
    expect(edited.exported.written).toHaveLength(1)
    expect((await json("notes", "export", "--to", out)).unchanged).toHaveLength(1)
    await expect(run("notes", "edit", id, "--revision", "1", "--text", "stale")).rejects.toThrow(/changed/)

    await run("notes", "remove", id)
    expect((await json("notes", "list", "--about", "telegram:101")).items).toEqual([])
  })

  it("refuses to edit a file's note, which is edited in its file", async () => {
    await run("notes", "import")
    const note = await json("notes", "show", join(vault, "Projects/Harbour.md"))
    await expect(run("notes", "edit", note.id, "--revision", "1", "--text", "x")).rejects.toThrow(/edited in its file/)
  })
})
