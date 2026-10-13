import type { MessageStore, Note } from "@wirecat/cli-messaging/store"
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

export type ListedNote = Note & { via?: Via }

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
  for (const { note, via } of await notesReaching(store, about)) {
    const known = byRef.get(note.ref)
    if (!known || PRIORITY.indexOf(via) < PRIORITY.indexOf(known.via as Via)) byRef.set(note.ref, { ...note, via })
  }
  const all = [...byRef.values()]
    .filter((note) => holds(note, filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.ref.localeCompare(a.ref))
  return { items: all.slice(offset, offset + limit), hasMore: all.length > offset + limit }
}
