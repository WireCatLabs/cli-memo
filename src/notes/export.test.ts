import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { dialectOf } from "./dialects/index.js"
import { type ExportedNote, editedSinceExport, exportNotes } from "./export.js"
import { noteFiles } from "./files.js"

const note = (id: string, title: string, text = "Synthetic text."): ExportedNote => ({
  id,
  title,
  text,
  aliases: [],
  tags: ["follow-up"],
  links: [{ target: "person:01JPERSON", anchor: null, label: "Rin" }],
  frontMatter: {},
})

const dir = () => mkdtempSync(join(tmpdir(), "export-"))

describe("exportNotes", () => {
  it("writes each note with its memo-id and a hash that proves it unedited", () => {
    const target = dir()
    const result = exportNotes({ dir: target, dialect: dialectOf("obsidian"), notes: [note("n1", "Call: Rin?")] })
    expect(result.written).toEqual([join(target, "Call Rin.md")])
    const content = readFileSync(join(target, "Call Rin.md"), "utf8")
    expect(content).toMatch(/^---\nmemo-id: n1\nmemo-hash: [0-9a-f]{64}\n/)
    expect(editedSinceExport(content)).toBe(false)
    expect(dialectOf("obsidian").parse(content, "Call Rin.md").links[0]?.target).toBe("person:01JPERSON")
  })

  it("rewrites its own file in place, even after the title changed, and leaves an unchanged one alone", () => {
    const target = dir()
    const dialect = dialectOf("markdown")
    exportNotes({ dir: target, dialect, notes: [note("n1", "First")] })
    expect(exportNotes({ dir: target, dialect, notes: [note("n1", "First")] }).unchanged).toHaveLength(1)
    const renamed = exportNotes({ dir: target, dialect, notes: [note("n1", "Second", "New text.")] })
    expect(renamed.written).toEqual([join(target, "First.md")])
    expect(readFileSync(join(target, "First.md"), "utf8")).toContain("New text.")
  })

  it("does not overwrite a file edited since memo wrote it", () => {
    const target = dir()
    const dialect = dialectOf("obsidian")
    exportNotes({ dir: target, dialect, notes: [note("n1", "Plan")] })
    const path = join(target, "Plan.md")
    writeFileSync(path, `${readFileSync(path, "utf8")}\nAdded by hand.\n`)
    const result = exportNotes({ dir: target, dialect, notes: [note("n1", "Plan", "Changed in memo.")] })
    expect(result.edited).toEqual([{ path, id: "n1" }])
    expect(readFileSync(path, "utf8")).toContain("Added by hand.")
  })

  it("never touches a file memo did not write", () => {
    const target = dir()
    writeFileSync(join(target, "Plan.md"), "# The owner's own plan\n")
    const result = exportNotes({ dir: target, dialect: dialectOf("obsidian"), notes: [note("01JNOTEID1", "Plan")] })
    expect(readFileSync(join(target, "Plan.md"), "utf8")).toBe("# The owner's own plan\n")
    expect(result.written).toEqual([join(target, "Plan (JNOTEID1).md")])
  })

  it("writes files an import of the same folder skips", () => {
    const target = dir()
    writeFileSync(join(target, "Own.md"), "# Own\n")
    exportNotes({ dir: target, dialect: dialectOf("obsidian"), notes: [note("n1", "Exported")] })
    expect(noteFiles(target).map((path) => path.slice(target.length + 1))).toEqual(["Own.md"])
    expect(readdirSync(target).filter((name) => name.includes("memo-tmp"))).toEqual([])
  })
})
