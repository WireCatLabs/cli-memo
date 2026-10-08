import { closeSync, openSync, readdirSync, readSync } from "node:fs"
import { join, relative, sep } from "node:path"

export const NOTE_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".tsv",
  ".pdf",
  ".docx",
  ".xlsx",
  ".odt",
  ".ods",
  ".pptx",
  ".epub",
  ".doc",
  ".xls",
]

const MEMO_ID = /^---\r?\n(?:[^\n]*\n)*?memo-id:[ \t]*["']?([^"'\s]+)/
const HEAD = 1024

/** The `memo-id` of a file memo exported, read from the front matter at its start; `null` for any other file. */
export const readMemoId = (path: string): string | null => {
  const buffer = Buffer.alloc(HEAD)
  const descriptor = openSync(path, "r")
  try {
    const head = buffer.subarray(0, readSync(descriptor, buffer, 0, HEAD, 0)).toString("utf8")
    const end = head.indexOf("\n---", 3)
    return MEMO_ID.exec(end < 0 ? head : head.slice(0, end + 1))?.[1] ?? null
  } finally {
    closeSync(descriptor)
  }
}

const TEXT_NOTE = /\.(md|markdown)$/i

const pattern = (rule: string): RegExp => {
  const glob = rule.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  const body = glob
    .split(/(\*\*\/?|\*|\?)/)
    .map((part) =>
      part === "**/" || part === "**"
        ? ".*"
        : part === "*"
          ? "[^/]*"
          : part === "?"
            ? "[^/]"
            : part.replace(/[.+^${}()|[\]\\]/g, "\\$&"),
    )
    .join("")
  // A rule names a path inside the folder, and everything under it when it is a folder.
  return new RegExp(`^${body}(/.*)?$`, "i")
}

/**
 * Note files under `folder`, as absolute paths. Hidden entries (`.obsidian`, `.trash`) are skipped, and
 * so is whatever an `ignore` rule names — a path inside the folder (`Psychology/Personal Notes.md`,
 * `Archive`) or a glob (`**\/Private*`, `*.txt`). A note memo exported is skipped too: it is already in
 * the store, and importing it would make it a second note.
 */
export const noteFiles = (folder: string, ignore: string[] = [], extensions = NOTE_EXTENSIONS): string[] => {
  const rules = ignore.map(pattern)
  const ignored = (path: string) => {
    const inside = relative(folder, path).split(sep).join("/")
    return rules.some((rule) => rule.test(inside))
  }
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith(".")) return []
      const path = join(dir, entry.name)
      if (ignored(path)) return []
      if (entry.isDirectory()) return walk(path)
      if (!entry.isFile() || !extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) return []
      return TEXT_NOTE.test(entry.name) && readMemoId(path) !== null ? [] : [path]
    })
  return walk(folder)
}
