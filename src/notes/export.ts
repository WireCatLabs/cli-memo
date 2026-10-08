import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { NoteDialect, NoteForExport } from "./dialects/index.js"
import { readMemoId } from "./files.js"

export interface ExportedNote extends NoteForExport {
  /** The note's id in the store; written as `memo-id` so import skips the file. */
  id: string
}

export interface ExportResult {
  dir: string
  written: string[]
  unchanged: string[]
  /** Files memo wrote that were edited since: left as they are, so the edit is not lost. */
  edited: { path: string; id: string }[]
}

const HASH_LINE = /^memo-hash: .*\r?\n/m
const PLACEHOLDER = "f".repeat(64)
const UNSAFE = /[\\/:*?"<>|#^[\]\p{Cc}]/gu
const MAX_NAME = 120

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

/**
 * The hash covers the file minus its own `memo-hash` line, so a file can prove it is still what memo
 * wrote without memo keeping any record of its own.
 */
const withHash = (content: string): string => {
  const hash = sha256(content.replace(HASH_LINE, ""))
  return content.replace(`memo-hash: ${PLACEHOLDER}`, `memo-hash: ${hash}`)
}

export const editedSinceExport = (content: string): boolean => {
  const stored = /^memo-hash: ([0-9a-f]{64})$/m.exec(content)?.[1]
  return stored === undefined || sha256(content.replace(HASH_LINE, "")) !== stored
}

const fileName = (title: string, id: string, taken: (name: string) => boolean): string => {
  const base = title.replace(UNSAFE, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || id
  const plain = `${base}.md`
  return taken(plain) ? `${base} (${id.slice(-8)}).md` : plain
}

const exportedIn = (dir: string): Map<string, string> => {
  const found = new Map<string, string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(md|markdown)$/i.test(entry.name)) continue
    const id = readMemoId(join(dir, entry.name))
    if (id !== null) found.set(id, entry.name)
  }
  return found
}

/**
 * Writes each note to `dir` in `dialect`'s format. A file keeps its name across exports (found by its
 * `memo-id`), is rewritten only while it is still what memo wrote, and a file memo did not write is never
 * touched. Nothing is deleted.
 */
export const exportNotes = ({
  dir,
  dialect,
  notes,
}: {
  dir: string
  dialect: NoteDialect
  notes: ExportedNote[]
}): ExportResult => {
  mkdirSync(dir, { recursive: true })
  const existing = exportedIn(dir)
  const claimed = new Set(existing.values())
  const result: ExportResult = { dir, written: [], unchanged: [], edited: [] }

  for (const { id, ...note } of notes) {
    const frontMatter: Record<string, unknown> = { "memo-id": id, "memo-hash": PLACEHOLDER, ...note.frontMatter }
    frontMatter["memo-id"] = id
    frontMatter["memo-hash"] = PLACEHOLDER
    const content = withHash(dialect.render({ ...note, frontMatter }))
    const known = existing.get(id)
    const name =
      known ?? fileName(note.title, id, (candidate) => claimed.has(candidate) || existsSync(join(dir, candidate)))
    claimed.add(name)
    const path = join(dir, name)
    if (known !== undefined) {
      const current = readFileSync(path, "utf8")
      if (editedSinceExport(current)) {
        result.edited.push({ path, id })
        continue
      }
      if (current === content) {
        result.unchanged.push(path)
        continue
      }
    }
    // Hidden, so an import running meanwhile never lists a half-written file.
    const partial = join(dir, `.${name}.memo-tmp`)
    writeFileSync(partial, content)
    renameSync(partial, path)
    result.written.push(path)
  }
  return result
}
