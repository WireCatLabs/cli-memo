import { readFileSync, statSync } from "node:fs"
import { basename, resolve } from "node:path"
import { parse } from "yaml"
import { noteFiles } from "./files.js"

export interface NoteAbout {
  locator: string
  path: string
  modifiedAt: string
  aliases: string[]
}

export interface NoteMention {
  locator: string
  path: string
  line: number
  text: string
  modifiedAt: string
}

export interface NotesAnswer {
  name: string
  about: NoteAbout[]
  links: NoteMention[]
  /** The plain name only: another person with the same name matches too. */
  weak: NoteMention[]
  /** More links or weak mentions were found than the limit let through. */
  hasMore: boolean
  complete: boolean
  notRead: { folder: string; reason: string }[]
}

interface Note {
  path: string
  title: string
  aliases: string[]
  lines: string[]
  modifiedAt: string
}

const MAX_LINE = 200
const WIKI_LINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g

const same = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0

const frontMatter = (text: string): { data: Record<string, unknown>; bodyStart: number } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (match === null) return { data: {}, bodyStart: 0 }
  let data: unknown
  try {
    data = parse(match[1] ?? "")
  } catch {
    data = {}
  }
  const lines = match[0].split("\n").length - 1
  return { data: typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}, bodyStart: lines }
}

const aliasesOf = (data: Record<string, unknown>): string[] => {
  const value = data.aliases ?? data.alias
  if (typeof value === "string") return [value]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

const readNote = (path: string): Note => {
  const text = readFileSync(path, "utf8")
  return {
    path,
    title: basename(path).replace(/\.(md|txt)$/i, ""),
    aliases: aliasesOf(frontMatter(text).data),
    lines: text.split(/\r?\n/),
    modifiedAt: statSync(path).mtime.toISOString(),
  }
}

const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const plainName = (name: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${literal(name)}(?![\\p{L}\\p{N}])`, "iu")

export const linkTargets = (line: string): string[] =>
  [...line.matchAll(WIKI_LINK)].map((match) => basename((match[1] ?? "").trim()))

const mention = (note: Note, index: number): NoteMention => ({
  locator: `note:${note.path}#L${index + 1}`,
  path: note.path,
  line: index + 1,
  text: note.lines[index]?.trim().slice(0, MAX_LINE) ?? "",
  modifiedAt: note.modifiedAt,
})

const newestFirst = <T extends { modifiedAt: string }>(items: T[]): T[] =>
  items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

/** Reads only: never writes to a folder. A folder that cannot be read is reported, not fatal. */
export const findNotes = (folders: string[], name: string, limit = 20, ignore: string[] = []): NotesAnswer => {
  const notRead: NotesAnswer["notRead"] = []
  const notes = folders.flatMap((folder) => {
    try {
      return noteFiles(resolve(folder), ignore, [".md", ".markdown", ".txt"]).map(readNote)
    } catch (error) {
      notRead.push({ folder, reason: error instanceof Error ? error.message : String(error) })
      return []
    }
  })

  const isAbout = (note: Note) => [note.title, ...note.aliases].some((known) => same(known, name))
  const aboutNotes = notes.filter(isAbout)
  const names = [name, ...aboutNotes.flatMap((note) => [note.title, ...note.aliases])]
  const plain = names.map(plainName)

  const links: NoteMention[] = []
  const weak: NoteMention[] = []
  for (const note of notes) {
    if (isAbout(note)) continue
    const { bodyStart } = frontMatter(note.lines.join("\n"))
    note.lines.forEach((line, index) => {
      if (index < bodyStart) return
      if (linkTargets(line).some((target) => names.some((known) => same(known, target)))) {
        links.push(mention(note, index))
      } else if (plain.some((pattern) => pattern.test(line.replace(WIKI_LINK, "")))) {
        weak.push(mention(note, index))
      }
    })
  }

  return {
    name,
    about: newestFirst(
      aboutNotes.map((note) => ({
        locator: `note:${note.path}`,
        path: note.path,
        modifiedAt: note.modifiedAt,
        aliases: note.aliases,
      })),
    ),
    links: newestFirst(links).slice(0, limit),
    weak: newestFirst(weak).slice(0, limit),
    hasMore: links.length > limit || weak.length > limit,
    complete: notRead.length === 0,
    notRead,
  }
}
