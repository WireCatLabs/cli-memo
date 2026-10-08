import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { basename, extname, relative, sep } from "node:path"
import { normalizeTag } from "@leemour/cli-messaging"
import { extractText, importEngine, type LoadEngine, MAX_FILE_BYTES } from "@leemour/cli-messaging/documents"
import type { MessageStore, Note } from "@leemour/cli-messaging/store"
import type { BoundFolder } from "./bound.js"
import { dialectOf, type ParsedNote } from "./dialects/index.js"
import { NOTE_EXTENSIONS, noteFiles, readMemoId } from "./files.js"
import { documentOf, fileLinks } from "./links.js"
import { detectRenames } from "./renames.js"
import { type FolderState, loadFolderState, saveFolderState } from "./state.js"

export interface NotesImport {
  folder: string
  folderId: string
  notes: number
  /** Saved because they are new or their text changed. */
  changed: number
  /** Moved inside the folder: same note, same links and tags. */
  renamed: number
  deleted: number
  deletionsSkipped?: string
  notRead?: { path: string; status: string; engine?: string }[]
  truncated?: string[]
}

const MAX_TEXT = 200_000
const MAX_DELETED_SHARE = 0.2
const MIN_DELETIONS_CAPPED = 5
const PAGE = 500
const TEXT_NOTE = /\.(md|markdown|txt)$/i
const MEMO = "memo:"

const inside = (folder: string, path: string): string => relative(folder, path).split(sep).join("/")

export const folderNotes = async (store: MessageStore, folderId: string): Promise<Note[]> => {
  const notes: Note[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.notes.notes({ folderId, source: "file", limit: PAGE, offset })
    notes.push(...page.items)
    if (!page.hasMore) return notes
  }
}

/** Tags as the store takes them; a nested Obsidian tag (`area/work`) or any other spelling it refuses is left out. */
const storable = (tags: string[]): string[] =>
  [
    ...new Set(
      tags.flatMap((tag) => {
        try {
          return [normalizeTag(tag)]
        } catch {
          return []
        }
      }),
    ),
  ].sort()

/**
 * Each file is one note of its folder, named by its path inside the folder. What this computer last saw of
 * each file is kept beside the config (`state.ts`), so an untouched file is not even opened; the store's own
 * content hash keeps an unchanged file from being saved again on a computer importing it for the first time.
 * A file gone from one path whose content appears at a new one is a move. A file memo exported is not a note.
 */
export const importNotes = async (
  store: MessageStore,
  folder: BoundFolder,
  {
    ignore = [],
    env = process.env,
    loadEngine = importEngine,
  }: { ignore?: string[]; env?: NodeJS.ProcessEnv; loadEngine?: LoadEngine } = {},
): Promise<NotesImport> => {
  const before = loadFolderState(env, folder.id)
  const after: FolderState = { files: {}, documents: { ...before?.documents } }
  const dialect = dialectOf(folder.format)
  const stored = new Map((await folderNotes(store, folder.id)).map((note) => [note.path as string, note]))
  const notRead: NonNullable<NotesImport["notRead"]> = []
  const truncated: string[] = []
  const unreadable: string[] = []
  const read: { id: string; path: string; bytes: Buffer; hash: string }[] = []

  const files = noteFiles(folder.path, ignore, NOTE_EXTENSIONS, { skipExported: false })
  for (const path of files) {
    const id = inside(folder.path, path)
    const stat = statSync(path)
    const stamp = `${stat.mtimeMs}:${stat.size}:`
    const previous = before?.files[id]
    if (previous?.startsWith(stamp) || previous?.startsWith(`${MEMO}${stamp}`)) {
      after.files[id] = previous
      continue
    }
    if (stat.size > MAX_FILE_BYTES) {
      after.files[id] = stamp
      notRead.push({ path: id, status: "too-large" })
      unreadable.push(id)
      continue
    }
    // Only a file that changed is opened, so this check costs nothing on an untouched folder.
    if (TEXT_NOTE.test(id) && readMemoId(path) !== null) {
      after.files[id] = `${MEMO}${stamp}`
      continue
    }
    const bytes = readFileSync(path)
    const hash = createHash("sha256").update(bytes).digest("hex")
    after.files[id] = `${stamp}${hash}`
    read.push({ id, path, bytes, hash })
  }

  const listed = new Set(Object.keys(after.files).filter((id) => !after.files[id]?.startsWith(MEMO)))
  const goneHashes = Object.fromEntries(
    [...stored.values()]
      .filter((note) => !listed.has(note.path as string) && note.contentHash !== null)
      .map((note) => [note.path as string, note.contentHash as string]),
  )
  const newHashes = Object.fromEntries(
    read.filter(({ id }) => !stored.has(id)).map(({ id, hash }) => [id, hash] as const),
  )
  let renamed = 0
  for (const move of detectRenames(goneHashes, newHashes)) {
    const note = await store.notes.renameFileNote(folder.id, move.from, move.to)
    stored.delete(move.from)
    stored.set(move.to, note)
    renamed++
  }

  const parsed = new Map<string, ParsedNote>()
  let changed = 0
  let added = 0
  for (const { id, path, bytes, hash } of read) {
    if (stored.get(id)?.contentHash === hash) continue
    const extraction = await extractText(bytes, { kind: "file", name: basename(path), mime: null, path }, loadEngine)
    if (extraction.status !== "extracted") {
      notRead.push({
        path: id,
        status: extraction.status,
        ...("engine" in extraction ? { engine: extraction.engine } : {}),
      })
      unreadable.push(id)
      continue
    }
    const text = extraction.text.replace(/\r\n?/g, "\n")
    if (extraction.truncated || text.length > MAX_TEXT) truncated.push(id)
    const note = TEXT_NOTE.test(id) ? dialect.parse(text, id) : undefined
    const saved = await store.notes.saveFileNote({
      folderId: folder.id,
      path: id,
      title: note?.title ?? basename(id).replace(/\.[^.]+$/, ""),
      text: text.slice(0, MAX_TEXT),
      ...(note && Object.keys(note.frontMatter).length ? { frontMatter: note.frontMatter } : {}),
      contentHash: hash,
    })
    if (!stored.has(id)) added++
    stored.set(id, saved.note)
    if (note) parsed.set(id, note)
    after.documents[id] = {
      extractor: extraction.extractor,
      format: extname(id),
      provenance: extname(id).toLowerCase() === ".xlsx" ? "sheet-cell" : "source-text",
      truncated: truncated.includes(id),
      ...("spans" in extraction && extraction.spans ? { spans: extraction.spans } : {}),
      ...("cells" in extraction && extraction.cells ? { cells: extraction.cells } : {}),
    }
    if (saved.changed) changed++
  }

  const gone = [...stored.keys()].filter((id) => !listed.has(id))
  let deleted = 0
  let deletionsSkipped: string | undefined
  if (gone.length >= MIN_DELETIONS_CAPPED && gone.length > stored.size * MAX_DELETED_SHARE) {
    deletionsSkipped = `${gone.length} of ${stored.size} stored notes are missing from the folder — too many to trust; nothing deleted`
  } else if (gone.length > 0) {
    deleted = await store.notes.deleteFileNotes(folder.id, gone)
    for (const id of gone) {
      stored.delete(id)
      delete after.documents[id]
    }
  }
  const dropped = unreadable.filter((id) => stored.has(id))
  if (dropped.length) {
    deleted += await store.notes.deleteFileNotes(folder.id, dropped)
    for (const id of dropped) stored.delete(id)
  }

  const documents = [...stored.values()].map(documentOf)
  const relink = new Map(parsed)
  if (renamed + deleted + added > 0) {
    // A note added or moved can be what an older note's unresolved link was waiting for.
    const waiting = new Set(
      (await store.notes.links({ unresolved: true })).map(({ from }) => from.replace(/^note:/, "")),
    )
    for (const note of stored.values())
      if (waiting.has(note.id) && !relink.has(note.path as string) && TEXT_NOTE.test(note.path as string))
        relink.set(note.path as string, dialect.parse(note.text, note.path as string))
  }
  for (const [id, note] of relink) {
    const record = stored.get(id)
    if (record) await store.notes.replaceFileLinks(record.id, fileLinks(id, note.links, documents))
  }

  for (const [id, note] of parsed) await store.notes.replaceFileTags((stored.get(id) as Note).id, storable(note.tags))

  saveFolderState(env, folder.id, after)

  return {
    folder: folder.path,
    folderId: folder.id,
    notes: listed.size,
    changed,
    renamed,
    deleted,
    ...(notRead.length ? { notRead } : {}),
    ...(truncated.length ? { truncated } : {}),
    ...(deletionsSkipped === undefined ? {} : { deletionsSkipped }),
  }
}
