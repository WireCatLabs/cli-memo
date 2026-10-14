import type { MessageStore, Note } from "@wirecat/cli-core/store"
import type { Subject } from "../people/subject.js"
import { notesReaching, type Via } from "./about.js"

export interface NotesFilter {
  /** Notes about the subject, or linking it, or linking a note about it, or naming it in a link. */
  about?: Subject
  source?: Note["source"]
  search?: string
  offset: number
  limit: number
}

/** `anchors`: the headings or blocks its links point at; `linkText`: the name a `name` link was written with. */
export type ListedNote = Note & { via?: Via; anchors?: string[]; linkText?: string }

const PRIORITY: Via[] = ["about", "link", "through", "name"]

const holds = (note: Note, filter: NotesFilter) =>
  (filter.source === undefined || note.source === filter.source) &&
  (filter.search === undefined || note.text.toLowerCase().includes(filter.search.toLowerCase()))

export const listNotes = async (
  store: MessageStore,
  filter: NotesFilter,
): Promise<{ items: ListedNote[]; hasMore: boolean }> => {
  const { about, offset, limit, ...rest } = filter
  if (about === undefined) return store.notes.notes({ offset, limit, ...rest })
  const byRef = new Map<string, ListedNote>()
  for (const { note, via, anchor, text } of await notesReaching(store, about)) {
    const known = byRef.get(note.ref)
    const row =
      !known || PRIORITY.indexOf(via) < PRIORITY.indexOf(known.via as Via) ? { ...known, ...note, via } : known
    if (anchor !== null && !row.anchors?.includes(anchor)) row.anchors = [...(row.anchors ?? []), anchor]
    if (via === "name" && text !== null) row.linkText = text
    byRef.set(note.ref, row)
  }
  const all = [...byRef.values()]
    .filter((note) => holds(note, filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.ref.localeCompare(a.ref))
  return { items: all.slice(offset, offset + limit), hasMore: all.length > offset + limit }
}
