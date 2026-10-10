import { mkdirSync, mkdtempSync, readFileSync, renameSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LoadEngine } from "@wirecat/cli-messaging/documents"
import { openStore } from "@wirecat/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { folderNotes, importNotes } from "./import.js"

describe("document ingestion", () => {
  it("imports CSV and extractor text, reports unsupported/missing/scan states and notices equal-size edits", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-formats-")),
      vault = join(root, "vault")
    const env = { ...process.env, MEMO_STATE_DIR: join(root, "state") }
    mkdirSync(vault)
    const csv = join(vault, "budget.csv")
    writeFileSync(csv, "name,value\nAlpha,100\n")
    writeFileSync(join(vault, "proposal.docx"), Buffer.from("PK\x03\x04synthetic"))
    writeFileSync(join(vault, "legacy.doc"), "legacy")
    writeFileSync(join(vault, "scan.pdf"), "%PDF-synthetic")
    const load: LoadEngine = async (name) => {
      if (name === "mammoth")
        throw Object.assign(new Error("Cannot find package 'mammoth'"), { code: "ERR_MODULE_NOT_FOUND" })
      return {
        getDocumentProxy: async () => ({ numPages: 1, loadingTask: { destroy: async () => {} } }),
        extractText: async () => ({ text: "" }),
      }
    }
    const store = await openStore({ path: join(root, "store.db") })
    try {
      const made = await store.notes.addFolder({ name: "vault" })
      const folder = { id: made.id, path: vault, format: "obsidian" as const }
      const first = await importNotes(store, folder, { loadEngine: load, env })
      expect(first.changed).toBe(1)
      expect(first.notRead).toEqual([
        { path: "legacy.doc", status: "unsupported" },
        { path: "proposal.docx", status: "engine-missing", engine: "mammoth" },
        { path: "scan.pdf", status: "needs-agent" },
      ])
      const [budget] = await folderNotes(store, folder.id)
      const mine = await store.notes.addNote({ text: "My assessment", about: [`note:${budget?.id}`] })
      const stamp = new Date("2026-10-08T00:00:00Z")
      utimesSync(csv, stamp, stamp)
      await importNotes(store, folder, { loadEngine: load, env })
      writeFileSync(csv, "name,value\nBravo,200\n")
      const later = new Date("2026-10-08T00:00:01Z")
      utimesSync(csv, later, later)
      expect((await importNotes(store, folder, { loadEngine: load, env })).changed).toBe(1)
      expect((await store.notes.note(budget?.id as string)).text).toContain("Bravo,200")

      renameSync(csv, join(vault, "renamed.csv"))
      const moved = await importNotes(store, folder, { loadEngine: load, env })
      expect(moved).toMatchObject({ renamed: 1, deleted: 0 })
      expect(await store.notes.note(budget?.id as string)).toMatchObject({ path: "renamed.csv", deletedAt: null })
      expect((await store.notes.links({ from: `note:${mine.id}` }))[0]?.to).toBe(`note:${budget?.id}`)
      expect(readFileSync(join(vault, "renamed.csv"), "utf8")).toBe("name,value\nBravo,200\n")
    } finally {
      await store.close()
    }
  })
})
