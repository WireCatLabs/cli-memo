import { normalizeTag } from "@leemour/cli-messaging"
import { searchNotesQuery } from "@leemour/cli-messaging/services"
import type { Link, MessageStore, Note } from "@leemour/cli-messaging/store"

export interface NoteHit {
  ref: string
  source: Note["source"]
  folderId: string | null
  /** The note's path inside its folder; `null` for a note written in memo. */
  path: string | null
  title: string | null
  modifiedAt: string
  /** The first line holding a word of the query. */
  line: string
  links: Pick<Link, "to" | "targetText" | "kind" | "anchor">[]
}

export interface LinkedRecord {
  /** `person:…`, `note:…`, `entity:…`, or `null` while the name written in the notes matches nobody yet. */
  ref: string | null
  name: string | null
  /** How many of the notes found link it. */
  notes: number
}

export interface NotesSearch {
  query: string
  tag?: string
  filter?: string
  /** Notes are searched by their words and word stems; search by meaning comes when notes are embedded. */
  by: "words"
  hits: NoteHit[]
  hasMore: boolean
  nextOffset?: number
  /** What the notes found link to, most linked first. */
  linked: LinkedRecord[]
}

const MAX_LINE = 200
const MAX_OFFSET = 1000

const firstLine = (text: string, query: string): string => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 2 && !["and", "or", "not"].includes(word))
  const lines = text.split("\n")
  const found = lines.find((line) => words.some((word) => line.toLowerCase().includes(word)))
  return (found ?? lines.find((line) => line.trim() !== "") ?? "").trim().slice(0, MAX_LINE)
}

export const searchNotes = async (
  store: MessageStore,
  query: string,
  {
    limit = 20,
    offset = 0,
    tag,
    filter: expression,
    folderIds,
    source,
    exact = false,
  }: {
    limit?: number
    offset?: number
    tag?: string
    filter?: string
    folderIds?: string[]
    source?: Note["source"]
    exact?: boolean
  } = {},
): Promise<NotesSearch> => {
  const label = tag === undefined ? undefined : normalizeTag(tag)
  const filter =
    [expression ? `(${expression})` : "", label === undefined ? "" : `tag:${label}`].filter(Boolean).join(" AND ") ||
    undefined
  const text = [query.trim() ? `(${query})` : "", filter ?? ""].filter(Boolean).join(" AND ")
  const found = await searchNotesQuery(store, {
    text,
    limit,
    offset,
    exact,
    ...(folderIds === undefined ? {} : { folderIds }),
    ...(source === undefined ? {} : { source }),
  })
  const hits: NoteHit[] = []
  const counts = new Map<string, LinkedRecord>()
  for (const { ref, note } of found.items) {
    const links = (await store.notes.links({ from: ref })).map(({ to, targetText, kind, anchor }) => ({
      to,
      targetText,
      kind,
      anchor,
    }))
    hits.push({
      ref,
      source: note.source,
      folderId: note.folderId,
      path: note.path,
      title: note.title,
      modifiedAt: note.updatedAt,
      line: firstLine(note.text, query),
      links,
    })
    for (const link of new Map(links.map((link) => [link.to ?? `?${link.targetText}`, link])).values()) {
      const key = link.to ?? `?${link.targetText}`
      const known = counts.get(key) ?? { ref: link.to, name: link.targetText, notes: 0 }
      known.notes++
      counts.set(key, known)
    }
  }
  const names = new Map((await store.notes.entities()).map((entity) => [`entity:${entity.id}`, entity.name]))
  for (const record of counts.values()) {
    if (record.ref?.startsWith("entity:")) record.name = names.get(record.ref) ?? record.name
    if (record.ref?.startsWith("note:"))
      record.name =
        (await store.notes.note(record.ref.slice("note:".length)).catch(() => undefined))?.title ?? record.name
  }
  return {
    query,
    ...(label === undefined ? {} : { tag: label }),
    ...(filter === undefined ? {} : { filter }),
    by: "words",
    hits,
    hasMore: found.hasMore,
    ...(found.hasMore && offset + limit <= MAX_OFFSET ? { nextOffset: offset + limit } : {}),
    linked: [...counts.values()].sort(
      (a, b) => b.notes - a.notes || (a.name ?? a.ref ?? "").localeCompare(b.name ?? b.ref ?? ""),
    ),
  }
}
