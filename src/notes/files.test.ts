import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { noteFiles } from "./files.js"

const folder = (paths: string[]): string => {
  const root = mkdtempSync(join(tmpdir(), "files-"))
  for (const path of paths) {
    mkdirSync(join(root, path, ".."), { recursive: true })
    writeFileSync(join(root, path), "x")
  }
  return root
}

const listed = (root: string, ignore?: string[]) =>
  noteFiles(root, ignore)
    .map((path) => relative(root, path))
    .sort()

describe("noteFiles", () => {
  const root = folder([
    "a.md",
    "b.txt",
    "c.pdf",
    ".obsidian/app.md",
    "Psychology/Private Notes.md",
    "Psychology/Other.md",
    "Archive/old.md",
    "Archive/deep/older.md",
  ])

  it("lists supported documents and skips hidden folders", () => {
    expect(listed(root)).toEqual([
      "Archive/deep/older.md",
      "Archive/old.md",
      "Psychology/Other.md",
      "Psychology/Private Notes.md",
      "a.md",
      "b.txt",
      "c.pdf",
    ])
  })

  it("skips an ignored file by its path inside the folder, whatever its case", () => {
    expect(listed(root, ["psychology/private notes.md"])).not.toContain("Psychology/Private Notes.md")
    expect(listed(root, ["psychology/private notes.md"])).toContain("Psychology/Other.md")
  })

  it("skips everything under an ignored folder", () => {
    expect(listed(root, ["Archive/"]).filter((path) => path.startsWith("Archive"))).toEqual([])
  })

  it("takes globs", () => {
    expect(listed(root, ["**/Private*"])).not.toContain("Psychology/Private Notes.md")
    expect(listed(root, ["*.txt"])).not.toContain("b.txt")
    expect(listed(root, ["*.txt"])).toContain("a.md")
  })
})
