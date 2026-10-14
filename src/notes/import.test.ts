import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
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

describe("memo sync --notes", () => {
  it("refuses a folder with no id, naming both ways to give it one", async () => {
    writeFileSync(configPath(env), JSON.stringify({ notes: { folders: [join(root, "elsewhere")] } }))
    const answer = await json("sync", "--notes")
    const synced = answer.item
    process.exitCode = 0

    expect(answer.meta).toMatchObject({
      complete: false,
      issues: [{ code: "configuration_error", source: `notes ${join(root, "elsewhere")}` }],
    })

    expect(synced.failed).toEqual([
      {
        source: `notes ${join(root, "elsewhere")}`,
        code: "configuration_error",
        reason: expect.stringMatching(/memo folders add .*memo folders attach/),
      },
    ])
  })

  it("finds stored notes by their words", async () => {
    await run("sync", "--notes")

    const result = await json("search", "notes", "lighthouse")

    expect(paths(result.items)).toEqual([
      "People/Rin Example.md",
      "Projects/Lighthouse.md",
      "Psychology/Private Notes.md",
    ])
  })

  it("never stores an ignored note, and drops one ignored after it was stored", async () => {
    await run("sync", "--notes")

    await run("sync", "--notes", "--ignore", "Psychology/Private Notes.md")

    expect((await json("search", "notes", "dreams")).items).toEqual([])
  })

  it("keeps an edited note's new text searchable, and drops a deleted one", async () => {
    await run("sync", "--notes")
    write("Projects/Harbour.md", "Harbour plan moved to the quay.\n")
    utimesSync(join(vault, "Projects/Harbour.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    rmSync(join(vault, "Psychology/Private Notes.md"))

    const second = (await json("sync", "--notes")).item

    expect(second.notes[0]).toMatchObject({ changed: 1, deleted: 1 })
    expect(paths((await json("search", "notes", "quay")).items)).toEqual(["Projects/Harbour.md"])
    expect((await json("search", "notes", "dreams")).items).toEqual([])
  })

  it("saves only what changed since the last run", async () => {
    expect((await json("sync", "--notes")).item.notes[0]).toMatchObject({ notes: 4, changed: 4 })
    expect((await json("sync", "--notes")).item.notes[0]).toMatchObject({ notes: 4, changed: 0 })
  })

  it("refuses to drop most notes at once, and weighs them again next run", async () => {
    for (const name of ["a", "b", "c", "d", "e", "f"]) write(`Bulk/${name}.md`, `bulk ${name}\n`)
    await run("sync", "--notes")
    rmSync(join(vault, "Bulk"), { recursive: true })
    rmSync(join(vault, "Projects"), { recursive: true })

    const refused = (await json("sync", "--notes")).item

    expect(refused.notes[0].deletions_skipped).toMatch(/too many to trust/)
    expect(paths((await json("search", "notes", "bulk")).items)).toHaveLength(6)
    expect((await json("sync", "--notes")).item.notes[0].deletions_skipped).toMatch(/too many to trust/)
  })

  it("keeps a moved note's id, its links and its tags", async () => {
    await telegramPeople(["101", "Owner Example"])
    await run("sync", "--notes")
    const before = (await json("notes", "show", join(vault, "Projects/Lighthouse.md"))).item
    renameSync(join(vault, "Projects/Lighthouse.md"), join(vault, "Projects/Beacon.md"))

    expect((await json("sync", "--notes")).item.notes[0]).toMatchObject({ renamed: 1, deleted: 0 })

    const after = (await json("notes", "show", before.ref)).item
    expect(after).toMatchObject({ path: "Projects/Beacon.md", tags: ["work"] })
    expect(after.links).toHaveLength(2)
  })

  it("stores a file's tags and drops one the file no longer has", async () => {
    await run("sync", "--notes")
    expect((await json("search", "notes", "budget", "--tag", "work")).items).toHaveLength(1)

    write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]].\nBudget is open.\n")
    utimesSync(join(vault, "Projects/Lighthouse.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    await run("sync", "--notes")

    expect((await json("search", "notes", "budget", "--tag", "work")).items).toEqual([])
  })

  it("keeps a tag the owner added when the file stops stating it", async () => {
    await run("sync", "--notes")
    const ref = (await json("notes", "show", join(vault, "Projects/Lighthouse.md"))).item.ref
    await run("tags", "add", "work", "--note", ref)

    write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]].\nBudget is open.\n")
    utimesSync(join(vault, "Projects/Lighthouse.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    await run("sync", "--notes")

    expect((await json("notes", "show", ref)).item.labels).toEqual([{ tag: "work", origin: "owner" }])
  })

  it("labels every note under a subfolder, and none beside it", async () => {
    await run("sync", "--notes")
    const [folder] = (await json("folders", "list")).items
    expect((await json("tags", "add", "port", "--folder", folder.id, "--path", "Projects")).item).toMatchObject({
      added: ["port"],
    })

    expect(paths((await json("search", "notes", "plan OR budget", "--tag", "port")).items)).toEqual([
      "Projects/Harbour.md",
      "Projects/Lighthouse.md",
    ])
    expect((await json("tags", "list", "--type", "folder")).items).toEqual([
      expect.objectContaining({ type: "folder", tag: "port" }),
    ])
  })

  it("searches by words alone when the model is not downloaded, and says why", async () => {
    await run("sync", "--notes")
    const found = await json("search", "notes", "budget")
    expect(found).toMatchObject({ items: [{ path: "Projects/Lighthouse.md", found_by: ["words"] }] })
    expect(found.missing).toEqual([{ field: "found_by", why: expect.stringMatching(/not downloaded/) }])
  })

  it("does not import a note memo exported", async () => {
    write("Inbox/From memo.md", "---\nmemo-id: 01SYNTHETIC\nmemo-hash: x\n---\nexported lighthouse\n")

    await run("sync", "--notes")

    expect(paths((await json("search", "notes", "exported")).items)).toEqual([])
  })

  it("links a name no note has to the person, the moment someone by that name appears", async () => {
    await run("sync", "--notes")
    expect((await json("notes", "list", "--about", "person:nobody")).items).toEqual([])

    await telegramPeople(["102", "Kai Sample"])

    const { items } = await json("notes", "list", "--about", "telegram:Kai Sample")
    expect(paths(items)).toEqual(["Projects/Harbour.md", "Projects/Lighthouse.md"])
    expect(items.map(({ via }: { via: string }) => via)).toEqual(["link", "link"])
  })

  it("lists the note about a person, and the notes linking that note", async () => {
    await telegramPeople(["101", "Rin Example"])
    await run("sync", "--notes")

    await run("note", "telegram:101", join(vault, "People/Rin Example.md"))

    const { items } = await json("notes", "list", "--about", "telegram:Rin Example")
    expect(items.map(({ path, via }: { path: string; via: string }) => [path, via]).sort()).toEqual([
      ["People/Rin Example.md", "about"],
      ["Projects/Lighthouse.md", "through"],
    ])
  })

  it("lists the notes naming a person in a link two people's names fit", async () => {
    await telegramPeople(["102", "Kai Sample"], ["103", "Kai Sample"])
    await run("sync", "--notes")

    const kai = await json("notes", "list", "--about", "telegram:102")
    expect(kai.items.map(({ link_text }: { link_text: string }) => link_text)).toEqual(["Kai Sample", "Kai Sample"])
    expect(kai.items.map(({ path, via }: { path: string; via: string }) => [path, via]).sort()).toEqual([
      ["Projects/Harbour.md", "name"],
      ["Projects/Lighthouse.md", "name"],
    ])
  })

  it("names every heading a note links the subject under", async () => {
    write("Projects/Harbour.md", "Harbour plan, with [[Kai Sample#Budget]] and [[Kai Sample#Dates]].\n")
    await telegramPeople(["102", "Kai Sample"])
    await run("sync", "--notes")

    const { items } = await json("notes", "list", "--about", "telegram:102")
    expect(items.find(({ path }: { path: string }) => path === "Projects/Harbour.md").anchors).toEqual([
      "#Budget",
      "#Dates",
    ])
  })

  it("filters and pages the notes linking a subject like any other list", async () => {
    await telegramPeople(["102", "Kai Sample"])
    await run("sync", "--notes")

    const budget = await json("notes", "list", "--about", "telegram:102", "--search", "BUDGET")
    expect(paths(budget.items)).toEqual(["Projects/Lighthouse.md"])
    expect((await json("notes", "list", "--about", "telegram:102", "--source", "internal")).items).toEqual([])
    const first = await json("notes", "list", "--about", "telegram:102", "--limit", "1")
    const second = await json("notes", "list", "--about", "telegram:102", "--limit", "1", "--offset", "1")
    expect([first.page.has_more, second.page.has_more]).toEqual([true, false])
    expect(paths([...first.items, ...second.items])).toEqual(["Projects/Harbour.md", "Projects/Lighthouse.md"])
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
    expect(edited.item.exported.written).toHaveLength(1)
    expect((await json("notes", "export", "--to", out)).item.unchanged).toHaveLength(1)
    await expect(run("notes", "edit", id, "--revision", "1", "--text", "stale")).rejects.toThrow(/changed/)

    await run("notes", "remove", id)
    expect((await json("notes", "list", "--about", "telegram:101")).items).toEqual([])
  })

  it("refuses to edit a file's note, which is edited in its file", async () => {
    await run("sync", "--notes")
    const note = (await json("notes", "show", join(vault, "Projects/Harbour.md"))).item
    await expect(run("notes", "edit", note.ref, "--revision", "1", "--text", "x")).rejects.toThrow(/edited in its file/)
  })
})
