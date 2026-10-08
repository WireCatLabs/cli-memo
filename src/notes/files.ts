import { readdirSync } from "node:fs"
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
 * `Archive`) or a glob (`**\/Private*`, `*.txt`).
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
      return entry.isFile() && extensions.some((ext) => entry.name.toLowerCase().endsWith(ext)) ? [path] : []
    })
  return walk(folder)
}
