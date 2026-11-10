import type { MessageStore } from "@wirecat/cli-core/store"

export interface DocumentContext {
  ref: string
  title: string | null
  /** Folder names from the source's root down to the file, then the file: `Clients/Acme/Contract.docx`. */
  path: string | null
  /** Where the source opens it, such as Drive's web link; `null` for a local file. */
  url: string | null
  modifiedAt: string | null
  mime: string | null
}

const MAX_DEPTH = 20

/** What the owner needs to judge an item about a document without leaving the review: what it is and where. */
export const documentContext = async (store: MessageStore, ref: string): Promise<DocumentContext | null> => {
  const note = await store.notes.note(ref).catch(() => null)
  if (!note || note.deletedAt) return null
  const { folderId } = note
  const entryOf = async (externalId: string) =>
    folderId === null ? undefined : await store.catalog.get(folderId, externalId).catch(() => undefined)
  const entry = note.path === null ? undefined : await entryOf(note.path)
  // Without its catalog entry a Drive document's stored path is Drive's file id, not a place the owner knows.
  if (!entry)
    return { ref: note.ref, title: note.title, path: null, url: null, modifiedAt: note.modifiedAt, mime: null }
  const names = [entry.name]
  const seen = new Set([note.path])
  let parent = entry.parents[0]
  for (let depth = 0; parent !== undefined && !seen.has(parent) && depth < MAX_DEPTH; depth++) {
    seen.add(parent)
    const folder = await entryOf(parent)
    if (!folder) break
    names.unshift(folder.name)
    parent = folder.parents[0]
  }
  return {
    ref: note.ref,
    title: entry.name,
    path: names.join("/"),
    url: entry.url ?? null,
    modifiedAt: entry.modifiedAt ?? note.modifiedAt,
    mime: entry.mime ?? null,
  }
}
