import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { configPath, loadConfig } from "../config.js"
import { createProgram } from "../program.js"
import { attachFolder, bindFolder, detectFormat, folderPaths, noteFolders } from "./folders.js"

let root: string
let env: NodeJS.ProcessEnv

let stderr: string[] = []

const run = async (...args: string[]) => {
  const streams = captureStreams()
  stderr = streams.stderr
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("").trim()
}

const storedNotes = async (folderId: string) => {
  const store = await openStore({ env })
  try {
    return (await store.notes.notes({ folderId, source: "file" })).items
  } finally {
    await store.close()
  }
}

const withNotes = async () => {
  writeFileSync(join(root, "vault", "one.md"), "# One\n\nfirst synthetic note")
  writeFileSync(join(root, "vault", "two.md"), "# Two\n\nsecond synthetic note")
  const id = await run("folders", "add", join(root, "vault"))
  await run("sync", "--only", "notes", "--no-embed")
  return id
}

const writeConfig = (value: unknown) => {
  mkdirSync(join(root, "config"), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify(value))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "folders-"))
  for (const name of ["vault", "plain", "moved"]) mkdirSync(join(root, name))
  mkdirSync(join(root, "vault", ".obsidian"))
  env = { ...process.env, MEMO_CONFIG_DIR: join(root, "config"), MESSAGING_STORE: join(root, "messages.db") }
})

describe("folder config", () => {
  it("reads the bare paths written before folder ids", () => {
    writeConfig({ notes: { folders: [join(root, "vault")] } })
    expect(noteFolders(loadConfig(env).notes)).toEqual([{ id: null, path: join(root, "vault"), format: "obsidian" }])
    expect(folderPaths(loadConfig(env).notes)).toEqual([join(root, "vault")])
  })

  it("binds an id to a bare path in place", () => {
    const vault = join(root, "vault")
    const bound = bindFolder({ notes: { folders: [vault] } }, { id: "fld_one", path: `${vault}/`, format: "obsidian" })
    expect(bound.notes?.folders).toEqual([{ id: "fld_one", path: vault }])
  })

  it("moves an attached id to its new path and refuses a path that has another id", () => {
    const config = bindFolder({}, { id: "fld_one", path: join(root, "vault"), format: "obsidian" })
    const moved = attachFolder(config, "fld_one", join(root, "moved"), "markdown")
    expect(noteFolders(moved.config.notes)).toEqual([{ id: "fld_one", path: join(root, "moved"), format: "markdown" }])
    expect(() => attachFolder(moved.config, "fld_other", join(root, "moved"))).toThrow(/already folder/)
  })
})

describe("memo folders", () => {
  it("adds a folder to the store and the config, and attaches it on another computer", async () => {
    const id = await run("folders", "add", join(root, "vault"))
    expect(id).toMatch(/^\d+$/)
    expect(await run("folders", "add", join(root, "vault"))).toBe(id)

    env = { ...env, MEMO_CONFIG_DIR: join(root, "laptop") }
    expect(answerOf(await run("folders", "list", "--json")).items).toEqual([
      { id, name: "vault", format: "obsidian", path: null },
    ])
    expect(
      answerOf(await run("folders", "update", id, join(root, "plain"), "--format", "markdown", "--json")),
    ).toMatchObject({ id, path: join(root, "plain"), format: "markdown" })
    expect(answerOf(await run("folders", "list", "--json")).items).toEqual([
      { id, path: join(root, "plain"), format: "markdown" },
    ])
    expect(JSON.parse(readFileSync(configPath(env), "utf8")).notes.folders[0]).toEqual({
      id,
      path: join(root, "plain"),
      format: "markdown",
    })
  })

  it("refuses to attach an id the store does not have", async () => {
    await expect(run("folders", "update", "fld_unknown", join(root, "plain"))).rejects.toThrow(/has no folder/)
  })

  it("lists drive's Google Drive documents as drive's and refuses to attach them", async () => {
    const store = await openStore({ env })
    const drive = await store.notes.documentsAccount({ provider: "google-drive", account: "someone@example.com" }, true)
    await store.close()
    if (drive === undefined) throw new Error("no documents account")

    expect(answerOf(await run("folders", "list", "--json")).items).toEqual([
      { id: drive.id, name: "google-drive:someone@example.com", format: "markdown", path: null, kept_by: "drive" },
    ])
    expect(await run("folders", "list")).not.toContain("memo folders update")
    await expect(run("folders", "update", drive.id, join(root, "plain"))).rejects.toThrow(/drive keeps it/)
    expect(noteFolders(loadConfig(env).notes)).toEqual([])
  })

  it("picks obsidian for a vault or a folder inside one, markdown for any other, and --format over both", async () => {
    mkdirSync(join(root, "vault", "Daily"))
    const add = async (...args: string[]) => answerOf(await run("folders", "add", ...args, "--json"))
    expect(await add(join(root, "vault"))).toMatchObject({ format: "obsidian", format_from: "detected" })
    expect(await add(join(root, "vault", "Daily"))).toMatchObject({ format: "obsidian", format_from: "detected" })
    expect(await add(join(root, "plain"))).toMatchObject({ format: "markdown", format_from: "detected" })
    expect(await add(join(root, "moved"), "--format", "obsidian")).toMatchObject({
      format: "obsidian",
      format_from: "option",
    })
    expect(await add(join(root, "plain"))).toMatchObject({ format: "markdown", format_from: "saved", created: false })
    expect(detectFormat(join(root, "plain"))).toBe("markdown")
  })

  it("refuses a path that is not a folder", async () => {
    await expect(run("folders", "add", join(root, "missing"))).rejects.toThrow(/is not a folder/)
  })

  it("removes a folder from this computer and keeps its notes in the store", async () => {
    const id = await withNotes()
    const removed = answerOf(await run("folders", "remove", join(root, "vault"), "--json"))
    expect(removed).toEqual({ id, path: join(root, "vault"), format: "obsidian", removed: true, notes_deleted: 0 })
    expect(noteFolders(loadConfig(env).notes)).toEqual([])
    expect(answerOf(await run("folders", "list", "--json")).items).toEqual([
      { id, name: "vault", format: "obsidian", path: null },
    ])
    expect(await storedNotes(id)).toHaveLength(2)
  })

  it("deletes the folder's notes only with --yes", async () => {
    const id = await withNotes()
    await expect(run("folders", "remove", id, "--allow-delete", "--json")).rejects.toMatchObject({
      code: "confirmation_required",
      message: expect.stringMatching(/deletes 2 notes/),
    })
    expect(noteFolders(loadConfig(env).notes)).toHaveLength(1)
    expect(await storedNotes(id)).toHaveLength(2)

    const removed = answerOf(await run("folders", "remove", id, "--allow-delete", "--yes", "--json"))
    expect(removed).toMatchObject({ id, removed: true, notes_deleted: 2 })
    expect(noteFolders(loadConfig(env).notes)).toEqual([])
    expect(await storedNotes(id)).toEqual([])
  })

  it("deletes the notes of a folder kept for another computer", async () => {
    const id = await withNotes()
    await run("folders", "remove", id)
    await expect(run("folders", "remove", id)).rejects.toThrow(/not on this computer/)
    const removed = answerOf(await run("folders", "remove", id, "--allow-delete", "--yes", "--json"))
    expect(removed).toEqual({ id, path: null, format: "obsidian", removed: true, notes_deleted: 2 })
    expect(await storedNotes(id)).toEqual([])
  })

  it("refuses a folder it does not know", async () => {
    await expect(run("folders", "remove", "999")).rejects.toMatchObject({ code: "not_found" })
  })

  it("prints counts-only progress lines while sync reads the notes, with --json only", async () => {
    const id = await withNotes()
    expect(stderr.filter((line) => line.includes('"progress"'))).toEqual([])
    writeFileSync(join(root, "vault", "three.md"), "# Three\n\nthird synthetic note")
    await run("sync", "--only", "notes", "--no-embed", "--json")
    const lines = stderr.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line))
    expect(lines[0]).toEqual({ event: "progress", step: "notes", done: 0, total: 3, unit: "files", label: id })
    expect(lines.at(-1)).toEqual({ event: "progress", step: "notes", done: 3, total: 3, unit: "files", label: id })
    expect(stderr.join("")).not.toMatch(/three|Three/)
  })
})
