import { mkdirSync, mkdtempSync, readFileSync, renameSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatLocator } from "@leemour/cli-messaging"
import type { LoadEngine } from "@leemour/cli-messaging/documents"
import { openStore } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { importNotes, notesKey } from "./import.js"

describe("document ingestion", () => {
  it("imports CSV and extractor text, reports unsupported/missing/scan states and notices equal-size edits", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-formats-")),
      vault = join(root, "vault")
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
        getDocumentProxy: async () => ({ loadingTask: { destroy: async () => {} } }),
        extractText: async () => ({ text: "" }),
      }
    }
    const store = await openStore({ path: join(root, "store.db") })
    try {
      const first = await importNotes(store, vault, { loadEngine: load })
      expect(first.changed).toBe(1)
      expect(first.notRead).toEqual([
        { path: "legacy.doc", status: "unsupported" },
        { path: "proposal.docx", status: "engine-missing", engine: "mammoth" },
        { path: "scan.pdf", status: "needs-agent" },
      ])
      const bytes = readFileSync(csv)
      const key = notesKey(vault),
        locator = formatLocator({ ...key, chat: ".", message: "budget.csv" })
      const annotation = await store.knowledge.addAnnotation(key, { type: "message", locator }, "My assessment")
      await store.addTags(key, { type: "message", chatId: ".", messageId: "budget.csv" }, ["budget"])
      const stamp = new Date("2026-10-08T00:00:00Z")
      utimesSync(csv, stamp, stamp)
      await importNotes(store, vault, { loadEngine: load })
      writeFileSync(csv, "name,value\nBravo,200\n")
      utimesSync(csv, stamp, stamp)
      expect((await importNotes(store, vault, { loadEngine: load })).changed).toBe(1)
      expect((await store.message(key, "budget.csv", { chatId: "." }))?.text).toContain("Bravo,200")
      expect(await store.knowledge.annotation(key, annotation.id)).toMatchObject({ text: "My assessment" })
      renameSync(csv, join(vault, "renamed.csv"))
      await importNotes(store, vault, { loadEngine: load })
      expect(await store.knowledge.annotation(key, annotation.id)).toMatchObject({ targetState: "deleted" })
      expect(
        await store.knowledge.tags(key, {
          type: "message",
          locator: formatLocator({ ...key, chat: ".", message: "renamed.csv" }),
        }),
      ).toEqual([])
      expect(readFileSync(join(vault, "renamed.csv"), "utf8")).toBe("name,value\nBravo,200\n")
      expect(bytes.toString()).toBe("name,value\nAlpha,100\n")
    } finally {
      await store.close()
    }
  })
})
