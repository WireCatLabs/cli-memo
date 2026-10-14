import type { MessageStore, Note } from "@wirecat/cli-core/store"
import type { Subject } from "../people/subject.js"
import { notesReaching, type Via } from "./about.js"

/** `about` is walked through links, so it stands alone: the store filters `source` and `search`, never this code. */
export type NotesFilter = { offset: number; limit: number } & (
  | {
      /** Notes about the subject, or linking it, or linking a note about it, or naming it in a link. */
      about: Subject
    }
  | { about?: undefined; source?: Note["source"]; search?: string }
)

/** `anchors`: the headings or blocks its links point at; `linkText`: the name a `name` link was written with. */
export type ListedNote = Note & { via?: Via; anchors?: string[]; linkText?: string }

const PRIORITY: Via[] = ["about", "link", "through", "name"]

export const listNotes = async (
  store: MessageStore,
  filter: NotesFilter,
): Promise<{ items: ListedNote[]; hasMore: boolean }> => {
  const { offset, limit } = filter
  if (filter.about === undefined) {
    const { about: _, ...rest } = filter
    return store.notes.notes(rest)
  }
  const { about } = filter
  const byRef = new Map<string, ListedNote>()
  for (const { note, via, anchor, text } of await notesReaching(store, about)) {
    const known = byRef.get(note.ref)
    const row =
      !known || PRIORITY.indexOf(via) < PRIORITY.indexOf(known.via as Via) ? { ...known, ...note, via } : known
    if (anchor !== null && !row.anchors?.includes(anchor)) row.anchors = [...(row.anchors ?? []), anchor]
    if (via === "name" && text !== null) row.linkText = text
    byRef.set(note.ref, row)
  }
  const all = [...byRef.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.ref.localeCompare(a.ref))
  return { items: all.slice(offset, offset + limit), hasMore: all.length > offset + limit }
}
