import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { searchNotesQuery } from "@wirecat/cli-core/services"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, describe, expect, it } from "vitest"
import { folderNotes, importNotes } from "./import.js"

const AUGUST = new Date("2026-08-14T09:47:00Z")
const opened: MessageStore[] = []
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close()
})

const vaultWith = async (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "memo-dates-"))
  const vault = join(root, "vault")
  mkdirSync(vault)
  for (const [path, text] of Object.entries(files)) {
    writeFileSync(join(vault, path), text)
    utimesSync(join(vault, path), AUGUST, AUGUST)
  }
  const path = join(root, "store.db")
  const store = await openStore({ path })
  opened.push(store)
  const made = await store.notes.addFolder({ name: "vault", format: "markdown" })
  const folder = { id: made.id, path: vault, format: "markdown" as const }
  const env = { ...process.env, MEMO_STATE_DIR: join(root, "state") }
  return { store, folder, env, path, sync: () => importNotes(store, folder, { env }) }
}

const timesOf = async (store: MessageStore, folderId: string) =>
  Object.fromEntries((await folderNotes(store, folderId)).map((note) => [note.path, note.modifiedAt]))

describe("note dates", () => {
  it("dates a note by its file's time, and by its front matter date when it has one", async () => {
    const { store, folder, sync } = await vaultWith({
      "critique.md": "let us hold the design critique 9 days from today\n",
      "review.md": "---\ndate: 2026-08-01\n---\ndesign review\n",
      "standup.md": "---\ndate: 2026-07-30T08:15:00Z\n---\nstandup\n",
      "broken.md": "---\ndate: next week\n---\nbroken date\n",
    })
    await sync()

    expect(await timesOf(store, folder.id)).toEqual({
      "critique.md": AUGUST.toISOString(),
      "review.md": new Date(2026, 7, 1).toISOString(),
      "standup.md": "2026-07-30T08:15:00.000Z",
      "broken.md": AUGUST.toISOString(),
    })
    const [hit] = (await searchNotesQuery(store, { text: "critique", limit: 5 })).items
    expect(hit?.at).toBe(AUGUST.toISOString())
  })

  it("dates a note imported before notes were dated on the next sync, without saving its text again", async () => {
    const { store, folder, path, sync } = await vaultWith({ "critique.md": "the design critique\n" })
    await sync()
    const database = new DatabaseSync(path)
    database.exec("UPDATE documents SET external_updated_at = NULL; UPDATE files SET external_updated_at = NULL")
    database.close()
    expect(await timesOf(store, folder.id)).toEqual({ "critique.md": null })

    expect(await sync()).toMatchObject({ changed: 0 })
    const [note] = await folderNotes(store, folder.id)
    expect(note).toMatchObject({ modifiedAt: AUGUST.toISOString(), revision: 1 })
  })
})
