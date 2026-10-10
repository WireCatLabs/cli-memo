import { posix } from "node:path"
import type { LinkInput, Note } from "@wirecat/cli-messaging/store"
import { isReference } from "./dialects/common.js"
import type { NoteLink } from "./dialects/index.js"

/** A stored file note as links see it: where it is and every name it answers to. */
export interface FolderDocument {
  id: string
  path: string
  aliases: string[]
}

const fold = (value: string) => value.normalize("NFC").toLocaleLowerCase("en")
const stem = (path: string) => path.replace(/\.(md|markdown|txt|csv|tsv|pdf|docx|xlsx)$/i, "")

const aliasesOf = (frontMatter: unknown): string[] => {
  const value =
    (frontMatter as { aliases?: unknown; alias?: unknown } | null)?.aliases ??
    (frontMatter as { alias?: unknown } | null)?.alias
  if (typeof value === "string") return [value]
  return Array.isArray(value) ? value.filter((alias): alias is string => typeof alias === "string") : []
}

export const documentOf = (note: Note): FolderDocument => ({
  id: note.id,
  path: note.path as string,
  aliases: aliasesOf(note.frontMatter),
})

/** The notes a written target names: by path (relative when it starts with `./` or `../`), else by file name or alias. */
export const notesNamed = (source: string, target: string, documents: FolderDocument[]): FolderDocument[] => {
  const normalized = stem(posix.normalize(target.replace(/\\/g, "/").replace(/^\//, "")))
  const relative = stem(posix.normalize(posix.join(posix.dirname(source), normalized)))
  const explicit =
    target.startsWith("./") || target.startsWith("../") || target.startsWith("/") || normalized.includes("/")
  const preferred = target.startsWith("./") || target.startsWith("../") ? relative : normalized
  if (target === "") return documents.filter((doc) => doc.path === source)
  if (explicit) return documents.filter((doc) => fold(stem(doc.path)) === fold(preferred))
  const name = fold(stem(target))
  return documents.filter((doc) =>
    [stem(posix.basename(doc.path)), ...doc.aliases].some((known) => fold(known) === name),
  )
}

/**
 * What a file's links become in the store. A record (`person:…`, `msg:…`) is linked as written; a note
 * named once is linked by id. A name no note has — or several have — stays as written, so the store can
 * resolve it to a person the moment one by that name, alias or username appears.
 */
export const fileLinks = (
  source: string,
  links: NoteLink[],
  documents: FolderDocument[],
): Omit<LinkInput, "from" | "origin">[] =>
  links.map(({ target, anchor }) => {
    const at = anchor === null ? {} : { anchor }
    if (isReference(target)) return { to: target, kind: "links-to", ...at }
    const named = notesNamed(source, target, documents)
    return named.length === 1
      ? { to: `note:${(named[0] as FolderDocument).id}`, kind: "links-to", ...at }
      : { targetText: posix.basename(target.replace(/\\/g, "/")) || target, kind: "links-to", ...at }
  })
