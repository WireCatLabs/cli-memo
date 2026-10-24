import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
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

const json = async (...args: string[]) => answerOf(await run(...args, "--json"))

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
    await store.messages.saveMessages({ provider: "telegram", account: "1" }, `chat-${id}`, [message(id, id, name)], {
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

describe("memo sync --only notes", () => {
  it("refuses a folder with no id, naming both ways to give it one", async () => {
    writeFileSync(configPath(env), JSON.stringify({ notes: { folders: [join(root, "elsewhere")] } }))
    const answer = envelopeOf(await run("sync", "--only", "notes", "--json"))
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
        reason_id: "folder.unbound",
        reason: expect.stringMatching(/memo folders add .*memo folders attach/),
      },
    ])
  })

  it("finds stored notes by their words and lists what they link", async () => {
    await run("sync", "--only", "notes")

    const result = await json("search", "notes", "lighthouse")

    expect(paths(result.items)).toEqual([
      "People/Rin Example.md",
      "Projects/Lighthouse.md",
      "Psychology/Private Notes.md",
    ])
    const text = await run("search", "notes", "lighthouse")
    expect(text).toContain("Linked from these notes")
    expect(text).toMatch(/ {2}Rin Example {2}\S+ {2}\(1\)/)
    expect(text).toContain("  Kai Sample  (nobody by that name yet)  (1)")
  })

  it("never stores a note the config ignores, and drops one ignored after it was stored", async () => {
    await run("sync", "--only", "notes")
    const config = JSON.parse(readFileSync(configPath(env), "utf8"))
    config.notes.ignore = ["Psychology/Private Notes.md"]
    writeFileSync(configPath(env), JSON.stringify(config))

    await run("sync", "--only", "notes")

    expect((await json("search", "notes", "dreams")).items).toEqual([])
  })

  it("reports a missing folder as not found, not as a bug", async () => {
    rmSync(vault, { recursive: true })

    const answer = envelopeOf(await run("sync", "--only", "notes", "--json"))
    process.exitCode = 0

    expect(answer.item.failed).toEqual([
      {
        source: `notes ${vault}`,
        code: "not_found",
        reason_id: "notes.folder-missing",
        reason: `the notes folder ${vault} is missing — connect its disk; if it moved, memo folders attach <id> <new path>`,
      },
    ])
  })

  it("leaves a stored note alone for a run that --ignore skips it", async () => {
    await run("sync", "--only", "notes")

    const skipped = await json("sync", "--only", "notes", "--ignore", "Psychology")
    const next = await json("sync", "--only", "notes")

    expect(skipped.notes[0]).toMatchObject({ notes: 4, deleted: 0 })
    expect(next.notes[0]).toMatchObject({ notes: 4, changed: 0, deleted: 0 })
    expect(paths((await json("search", "notes", "dreams")).items)).toEqual(["Psychology/Private Notes.md"])
  })

  it("reports a file an older state file left unmarked as not read", async () => {
    write("Old/legacy.doc", "synthetic")
    await run("sync", "--only", "notes")
    const [stateFile] = readdirSync(join(root, "state", "folders"))
    const state = join(root, "state", "folders", stateFile as string)
    const { notRead: _, ...older } = JSON.parse(readFileSync(state, "utf8"))
    writeFileSync(state, JSON.stringify(older))

    const answer = await json("sync", "--only", "notes")

    expect(answer.notes[0]).toMatchObject({ notes: 4, not_read: [{ path: "Old/legacy.doc", status: "unsupported" }] })
  })

  it("reports a file it cannot read on every run, not only the first", async () => {
    write("Old/legacy.doc", "synthetic")

    const first = await json("sync", "--only", "notes")
    const second = await json("sync", "--only", "notes")
    const text = await run("sync", "--only", "notes")

    for (const answer of [first, second])
      expect(answer.notes[0]).toMatchObject({ notes: 4, not_read: [{ path: "Old/legacy.doc", status: "unsupported" }] })
    expect(text).toContain("4 notes, 0 changed, 0 moved, 0 gone, 1 not read")
    expect(text).toContain("  not read: Old/legacy.doc — this file type cannot be read")
  })

  it("keeps an edited note's new text searchable, and drops a deleted one", async () => {
    await run("sync", "--only", "notes")
    write("Projects/Harbour.md", "Harbour plan moved to the quay.\n")
    utimesSync(join(vault, "Projects/Harbour.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    rmSync(join(vault, "Psychology/Private Notes.md"))

    const second = await json("sync", "--only", "notes")

    expect(second.notes[0]).toMatchObject({ changed: 1, deleted: 1 })
    expect(paths((await json("search", "notes", "quay")).items)).toEqual(["Projects/Harbour.md"])
    expect((await json("search", "notes", "dreams")).items).toEqual([])
  })

  it("saves only what changed since the last run", async () => {
    expect((await json("sync", "--only", "notes")).notes[0]).toMatchObject({ notes: 4, changed: 4 })
    expect((await json("sync", "--only", "notes")).notes[0]).toMatchObject({ notes: 4, changed: 0 })
  })

  it("refuses to drop most notes at once, and weighs them again next run", async () => {
    for (const name of ["a", "b", "c", "d", "e", "f"]) write(`Bulk/${name}.md`, `bulk ${name}\n`)
    await run("sync", "--only", "notes")
    rmSync(join(vault, "Bulk"), { recursive: true })
    rmSync(join(vault, "Projects"), { recursive: true })

    const refused = await json("sync", "--only", "notes")

    expect(refused.notes[0].deletions_skipped).toMatch(/too many to trust/)
    expect(paths((await json("search", "notes", "bulk")).items)).toHaveLength(6)
    expect((await json("sync", "--only", "notes")).notes[0].deletions_skipped).toMatch(/too many to trust/)
  })

  it("names a link that leads nowhere by its text in notes show", async () => {
    await run("sync", "--only", "notes")

    const text = await run("notes", "show", join(vault, "Projects/Harbour.md"))

    expect(text).toContain("links: Kai Sample (not found)\n")
  })

  it("keeps a moved note's id, its links and its tags", async () => {
    await telegramPeople(["101", "Owner Example"])
    await run("sync", "--only", "notes")
    const before = await json("notes", "show", join(vault, "Projects/Lighthouse.md"))
    renameSync(join(vault, "Projects/Lighthouse.md"), join(vault, "Projects/Beacon.md"))

    expect((await json("sync", "--only", "notes")).notes[0]).toMatchObject({ renamed: 1, deleted: 0 })

    const after = await json("notes", "show", before.ref)
    expect(after).toMatchObject({ path: "Projects/Beacon.md", tags: ["work"] })
    expect(after.links).toHaveLength(2)
  })

  it("stores a file's tags and drops one the file no longer has", async () => {
    await run("sync", "--only", "notes")
    expect((await json("search", "notes", "budget", "--filter", "tag:work")).items).toHaveLength(1)

    write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]].\nBudget is open.\n")
    utimesSync(join(vault, "Projects/Lighthouse.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    await run("sync", "--only", "notes")

    expect((await json("search", "notes", "budget", "--filter", "tag:work")).items).toEqual([])
  })

  it("keeps a tag the owner added when the file stops stating it", async () => {
    await run("sync", "--only", "notes")
    const ref = (await json("notes", "show", join(vault, "Projects/Lighthouse.md"))).ref
    await run("tags", "add", "work", "--note", ref)

    write("Projects/Lighthouse.md", "Kickoff with [[Rin Example]].\nBudget is open.\n")
    utimesSync(join(vault, "Projects/Lighthouse.md"), new Date("2030-01-01"), new Date("2030-01-01"))
    await run("sync", "--only", "notes")

    expect((await json("notes", "show", ref)).tags).toEqual(["work"])
  })

  it("labels every note under a subfolder, and none beside it", async () => {
    await run("sync", "--only", "notes")
    const [folder] = (await json("folders", "list")).items
    expect(await json("tags", "add", "port", "--folder", folder.id, "--subfolder", "Projects")).toMatchObject({
      added: ["port"],
    })

    expect(paths((await json("search", "notes", "plan OR budget", "--filter", "tag:port")).items)).toEqual([
      "Projects/Harbour.md",
      "Projects/Lighthouse.md",
    ])
    expect((await json("tags", "list", "type:folder")).items).toHaveLength(1)
  })

  it("searches by words alone when the model is not downloaded, and says why", async () => {
    await run("sync", "--only", "notes")
    const found = await json("search", "notes", "budget")
    expect(found.items).toMatchObject([{ path: "Projects/Lighthouse.md", found_by: ["words"] }])
    expect(found.missing).toEqual([{ field: "found_by", why: expect.stringMatching(/not downloaded/) }])
  })

  it("names Memo's downloader when search all skips meaning", async () => {
    await run("sync", "--only", "notes")
    const found = await json("search", "all", "budget", "--only", "notes")
    expect(found.missing).toEqual([
      { field: "found_by", why: expect.stringContaining("memo models text download e5-small") },
    ])
    expect(JSON.stringify(found.missing)).not.toMatch(/tg models/)
  })

  it("names the person a found note links", async () => {
    await run("sync", "--only", "notes")
    await telegramPeople(["102", "Kai Sample"])

    expect(await run("search", "notes", "harbour")).toMatch(/ {2}Kai Sample {2}person:\S+ {2}\(1\)/)
  })

  it("does not import a note memo exported", async () => {
    write("Inbox/From memo.md", "---\nmemo-id: 01SYNTHETIC\nmemo-hash: x\n---\nexported lighthouse\n")

    await run("sync", "--only", "notes")

    expect(paths((await json("search", "notes", "exported")).items)).toEqual([])
  })

  it("links a name no note has to the person, the moment someone by that name appears", async () => {
    await run("sync", "--only", "notes")
    expect((await json("notes", "list", `about:"person:nobody"`)).items).toEqual([])

    await telegramPeople(["102", "Kai Sample"])

    const { items } = await json("notes", "list", `about:"telegram:Kai Sample"`)
    expect(paths(items)).toEqual(["Projects/Harbour.md", "Projects/Lighthouse.md"])
    expect(items.map(({ via }: { via: string }) => via)).toEqual(["link", "link"])
  })

  it("lists the note about a person, and the notes linking that note", async () => {
    await telegramPeople(["101", "Rin Example"])
    await run("sync", "--only", "notes")

    await run("note", "telegram:101", join(vault, "People/Rin Example.md"))

    const { items } = await json("notes", "list", `about:"telegram:Rin Example"`)
    expect(items.map(({ path, via }: { path: string; via: string }) => [path, via]).sort()).toEqual([
      ["People/Rin Example.md", "about"],
      ["Projects/Lighthouse.md", "through"],
    ])
  })

  it("lists the notes naming a person in a link two people's names fit", async () => {
    await telegramPeople(["102", "Kai Sample"], ["103", "Kai Sample"])
    await run("sync", "--only", "notes")

    const kai = await json("notes", "list", `about:"telegram:102"`)
    expect(kai.items.map(({ link_text }: { link_text: string }) => link_text)).toEqual(["Kai Sample", "Kai Sample"])
    expect(kai.items.map(({ path, via }: { path: string; via: string }) => [path, via]).sort()).toEqual([
      ["Projects/Harbour.md", "name"],
      ["Projects/Lighthouse.md", "name"],
    ])
  })

  it("names every heading a note links the subject under", async () => {
    write("Projects/Harbour.md", "Harbour plan, with [[Kai Sample#Budget]] and [[Kai Sample#Dates]].\n")
    await telegramPeople(["102", "Kai Sample"])
    await run("sync", "--only", "notes")

    const { items } = await json("notes", "list", `about:"telegram:102"`)
    expect(items.find(({ path }: { path: string }) => path === "Projects/Harbour.md").anchors).toEqual([
      "#Budget",
      "#Dates",
    ])
  })

  it("pages the notes linking a subject like any other list, and refuses a filter beside about:", async () => {
    await telegramPeople(["102", "Kai Sample"])
    await run("sync", "--only", "notes")

    await expect(json("notes", "list", 'about:"telegram:102"', "text:BUDGET")).rejects.toMatchObject({
      code: "validation_error",
    })
    expect(paths((await json("notes", "list", "text:BUDGET")).items)).toContain("Projects/Lighthouse.md")
    const first = await json("notes", "list", 'about:"telegram:102"', "--limit", "1")
    const second = await json("notes", "list", 'about:"telegram:102"', "--limit", "1", "--page", "2")
    expect([first.page, second.page.has_more]).toEqual([
      { mode: "page", limit: 1, has_more: true, next_page: 2 },
      false,
    ])
    expect(first.next[0]).toMatchObject({
      step: "page.next",
      args: { query: 'about:"telegram:102"', page: 2, limit: 1 },
    })
    expect(paths([...first.items, ...second.items])).toEqual(["Projects/Harbour.md", "Projects/Lighthouse.md"])
  })
})

describe("notes written in memo", () => {
  it("adds, edits, lists and removes a note about a person, and exports it once", async () => {
    await telegramPeople(["101", "Rin Example"])
    const out = join(root, "exported")
    const id = (await run("notes", "add", "Prefers mornings", "--subject", "telegram:Rin Example")).trim()

    expect((await json("notes", "list", `about:"telegram:101"`)).items.map((note: { id: string }) => note.id)).toEqual([
      id,
    ])
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
    expect(edited).toMatchObject({ id, revision: 2, text: "Prefers early mornings" })
    expect(edited.export_path).toMatch(new RegExp(`^${out}/`))
    expect((await json("notes", "export", "--output-dir", out)).unchanged).toHaveLength(1)
    await expect(run("notes", "edit", id, "--revision", "1", "--text", "stale")).rejects.toThrow(/changed/)

    await run("notes", "remove", id)
    expect((await json("notes", "list", `about:"telegram:101"`)).items).toEqual([])
  })

  it("answers the note itself, so --json picks its fields, and refuses a field a note search lacks", async () => {
    const added = JSON.parse(await run("notes", "add", "Prefers tea", "--json=id,ref"))
    expect(added.item).toEqual({ id: expect.any(String), ref: `note:${added.item.id}` })
    await expect(run("notes", "show", added.item.ref, "--json=labels")).rejects.toMatchObject({
      details: { reason: "output.unknown-field" },
    })
    const searched = JSON.parse(await run("search", "notes", "tea", "--json"))
    for (const { why } of searched.missing ?? []) expect(why).not.toMatch(/`tg models/)
    await expect(run("search", "notes", "tea", "--json=text")).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "output.unknown-field" },
    })
  })

  it("refuses to edit a file's note, which is edited in its file", async () => {
    await run("sync", "--only", "notes")
    const note = await json("notes", "show", join(vault, "Projects/Harbour.md"))
    await expect(run("notes", "edit", note.ref, "--revision", "1", "--text", "x")).rejects.toThrow(/edited in its file/)
  })
})
