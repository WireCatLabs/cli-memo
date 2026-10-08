import { CliError } from "@leemour/cli-core"
import { normalizeTag } from "@leemour/cli-messaging"
import { nearestNotes, searchNotesQuery } from "@leemour/cli-messaging/services"
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
  /** Which halves of the search found it. */
  foundBy: ("words" | "meaning")[]
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
  /** Words and word stems always; meaning too when the model is there and the query is not exact. */
  by: "words" | "words and meaning"
  /** Why meaning was not searched, when it was not. */
  meaningSkipped?: string
  hits: NoteHit[]
  hasMore: boolean
  nextOffset?: number
  /** What the notes found link to, most linked first. */
  linked: LinkedRecord[]
}

const MAX_LINE = 200
const MAX_OFFSET = 1000
/** How deep each half is read before the two are merged. */
const CANDIDATES = 50
/** What a filter may narrow the meaning half to; past this the filter is applied to words only. */
const FILTERED = 500
/** Reciprocal rank fusion's usual constant, as conversations use. */
const RRF_K = 60

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
    env,
  }: {
    limit?: number
    offset?: number
    tag?: string
    filter?: string
    folderIds?: string[]
    source?: Note["source"]
    exact?: boolean
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<NotesSearch> => {
  const label = tag === undefined ? undefined : normalizeTag(tag)
  const filter =
    [expression ? `(${expression})` : "", label === undefined ? "" : `tag:${label}`].filter(Boolean).join(" AND ") ||
    undefined
  const text = [query.trim() ? `(${query})` : "", filter ?? ""].filter(Boolean).join(" AND ")
  const window = offset + limit
  const scope = {
    ...(folderIds === undefined ? {} : { folderIds }),
    ...(source === undefined ? {} : { source }),
  }
  let meaningSkipped: string | undefined
  let meaning: { ref: string; note: Note }[] | undefined
  if (exact) meaningSkipped = "--exact searches words as written"
  else if (query.trim()) {
    try {
      const nearest = await nearestNotes(store, query, {
        limit: Math.max(window, CANDIDATES),
        command: "tg",
        env,
        ...scope,
      })
      if (filter === undefined) meaning = nearest
      else {
        const allowed = await searchNotesQuery(store, { text: filter, limit: FILTERED, ...scope })
        const refs = new Set(allowed.items.map(({ ref }) => ref))
        meaning = nearest.filter(({ ref }) => refs.has(ref))
      }
    } catch (error) {
      if (!(error instanceof CliError && error.code === "not_found")) throw error
      meaningSkipped = error.message
    }
  }
  const words = await searchNotesQuery(store, {
    text,
    limit: meaning === undefined ? limit : Math.max(window, CANDIDATES),
    offset: meaning === undefined ? offset : 0,
    exact,
    ...scope,
  })
  const ranked = new Map<string, { note: Note; score: number; foundBy: ("words" | "meaning")[] }>()
  const add = (list: { ref: string; note: Note }[], by: "words" | "meaning") =>
    list.forEach(({ ref, note }, rank) => {
      const held = ranked.get(ref) ?? { note, score: 0, foundBy: [] }
      held.score += 1 / (RRF_K + rank + 1)
      held.foundBy.push(by)
      ranked.set(ref, held)
    })
  add(words.items, "words")
  if (meaning !== undefined) add(meaning, "meaning")
  const ordered = [...ranked.entries()].sort(([, a], [, b]) => b.score - a.score)
  const page = meaning === undefined ? ordered : ordered.slice(offset, window)
  const found = {
    items: page.map(([ref, { note, foundBy }]) => ({ ref, note, foundBy })),
    hasMore: meaning === undefined ? words.hasMore : ordered.length > window || words.hasMore,
  }
  const hits: NoteHit[] = []
  const counts = new Map<string, LinkedRecord>()
  for (const { ref, note, foundBy } of found.items) {
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
      foundBy,
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
    if (record.ref?.startsWith("person:"))
      record.name = (await store.personByUid(record.ref.slice("person:".length)))?.name ?? record.name
    if (record.ref?.startsWith("note:"))
      record.name =
        (await store.notes.note(record.ref.slice("note:".length)).catch(() => undefined))?.title ?? record.name
  }
  return {
    query,
    ...(label === undefined ? {} : { tag: label }),
    ...(filter === undefined ? {} : { filter }),
    by: meaning === undefined ? "words" : "words and meaning",
    ...(meaningSkipped === undefined ? {} : { meaningSkipped }),
    hits,
    hasMore: found.hasMore,
    ...(found.hasMore && offset + limit <= MAX_OFFSET ? { nextOffset: offset + limit } : {}),
    linked: [...counts.values()].sort(
      (a, b) => b.notes - a.notes || (a.name ?? a.ref ?? "").localeCompare(b.name ?? b.ref ?? ""),
    ),
  }
}
