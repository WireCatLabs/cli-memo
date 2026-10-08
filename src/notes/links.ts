import { posix } from "node:path"
import { isReference } from "./dialects/common.js"
import { dialectOf, type NoteDialect } from "./dialects/index.js"

export interface LinkedDocument {
  path: string
  /** As stored: the file name, a blank line, then the file's text. */
  text: string
}

export interface ResolvedLink {
  target: string
  anchor: string | null
  status: "resolved" | "ambiguous" | "unresolved"
  paths: string[]
}

const fold = (value: string) => value.normalize("NFC").toLocaleLowerCase("en")
const stem = (path: string) => path.replace(/\.(md|markdown|txt|csv|tsv|pdf|docx|xlsx)$/i, "")
const fileText = (stored: string) => stored.split("\n").slice(2).join("\n")

/**
 * Which stored notes each link of `source` names: by path (relative to the note when it starts with
 * `./` or `../`), else by file name or alias. A link to a record (`person:…`, `msg:…`) is not a note
 * and is left to the store.
 */
export const resolveLinks = (
  source: LinkedDocument,
  documents: LinkedDocument[],
  dialect: NoteDialect = dialectOf(),
): ResolvedLink[] => {
  const indexed = documents.map((doc) => ({
    ...doc,
    folded: fold(stem(doc.path)),
    names: [stem(posix.basename(doc.path)), ...dialect.parse(fileText(doc.text), doc.path).aliases].map(fold),
  }))
  return dialect
    .parse(fileText(source.text), source.path)
    .links.filter((link) => !isReference(link.target))
    .map(({ target, anchor }) => {
      const normalized = stem(posix.normalize(target.replace(/\\/g, "/").replace(/^\//, "")))
      const relative = stem(posix.normalize(posix.join(posix.dirname(source.path), normalized)))
      const explicit =
        target.startsWith("./") || target.startsWith("../") || target.startsWith("/") || normalized.includes("/")
      const preferred = target.startsWith("./") || target.startsWith("../") ? relative : normalized
      const exact =
        target === ""
          ? indexed.filter((doc) => doc.path === source.path)
          : explicit
            ? indexed.filter((doc) => doc.folded === fold(preferred))
            : []
      const fallback = explicit ? [] : indexed.filter((doc) => doc.names.includes(fold(stem(target))))
      const paths = [...new Set((exact.length ? exact : fallback).map((doc) => doc.path))].sort()
      return {
        target,
        anchor,
        status: paths.length === 1 ? "resolved" : paths.length ? "ambiguous" : "unresolved",
        paths,
      }
    })
}
