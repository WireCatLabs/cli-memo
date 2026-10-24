import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { basename, extname, relative, sep } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { normalizeTag } from "@wirecat/cli-core"
import { extractText, importEngine, type LoadEngine, MAX_FILE_BYTES } from "@wirecat/cli-core/documents"
import type { MessageStore, Note } from "@wirecat/cli-core/store"
import type { BoundFolder } from "./bound.js"
import { dialectOf, type ParsedNote } from "./dialects/index.js"
import { matcher, NOTE_EXTENSIONS, noteFiles, readMemoId } from "./files.js"
import { documentOf, fileLinks } from "./links.js"
import { detectRenames } from "./renames.js"
import { type FolderState, loadFolderState, saveFolderState } from "./state.js"

export interface NotesImport {
  folder: string
  folderId: string
  /** Notes stored from the folder: the files found, less those not read. */
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

export const missingFolder = (path: string): string =>
  `the notes folder ${path} is missing — connect its disk; if it moved, memo folders update <id> <new path>`

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
 * `ignore` keeps files out of the store, so a note stored before is dropped; `skip` only leaves them alone this run.
 */
export const importNotes = async (
  store: MessageStore,
  folder: BoundFolder,
  {
    ignore = [],
    skip = [],
    env = process.env,
    loadEngine = importEngine,
  }: { ignore?: string[]; skip?: string[]; env?: NodeJS.ProcessEnv; loadEngine?: LoadEngine } = {},
): Promise<NotesImport> => {
  if (!existsSync(folder.path))
    throw new CliError("not_found", missingFolder(folder.path), {
      reason: "notes.folder-missing",
      path: folder.path,
    })
  const before = loadFolderState(env, folder.id)
  const after: FolderState = { files: {}, documents: { ...before?.documents }, notRead: {} }
  const notReadNow = after.notRead as NonNullable<FolderState["notRead"]>
  const skipped = matcher(skip)
  const held = new Set<string>()
  const dialect = dialectOf(folder.format)
  const stored = new Map((await folderNotes(store, folder.id)).map((note) => [note.path as string, note]))
  const notRead: NonNullable<NotesImport["notRead"]> = []
  const truncated: string[] = []
  const unreadable: string[] = []
  const read: { id: string; path: string; bytes: Buffer; hash: string }[] = []
  const notReadAs = (path: string, status: string, engine?: string) => {
    const entry = { status, ...(engine === undefined ? {} : { engine }) }
    notRead.push({ path, ...entry })
    notReadNow[path] = entry
    unreadable.push(path)
  }

  const files = noteFiles(folder.path, ignore, NOTE_EXTENSIONS, { skipExported: false })
  for (const path of files) {
    const id = inside(folder.path, path)
    const previous = before?.files[id]
    const wasNotRead = before?.notRead?.[id]
    if (skipped(id)) {
      held.add(id)
      if (previous !== undefined) after.files[id] = previous
      if (wasNotRead) notReadNow[id] = wasNotRead
      continue
    }
    const stat = statSync(path)
    const stamp = `${stat.mtimeMs}:${stat.size}:`
    const exported = previous?.startsWith(`${MEMO}${stamp}`)
    // A missing reader may have been installed since, so that file is read again; so is an unstored file an older
    // state file did not mark as not read.
    const settled = stored.has(id) || (wasNotRead !== undefined && wasNotRead.status !== "engine-missing")
    if (exported || (previous?.startsWith(stamp) && settled)) {
      after.files[id] = previous as string
      if (wasNotRead) notReadAs(id, wasNotRead.status, wasNotRead.engine)
      continue
    }
    if (stat.size > MAX_FILE_BYTES) {
      after.files[id] = stamp
      notReadAs(id, "too-large")
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

  const listed = new Set([
    ...Object.keys(after.files).filter((id) => !after.files[id]?.startsWith(MEMO)),
    ...[...held].filter((id) => stored.has(id)),
  ])
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
      notReadAs(id, extraction.status, "engine" in extraction ? extraction.engine : undefined)
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
    notes: listed.size - Object.keys(notReadNow).filter((id) => listed.has(id)).length,
    changed,
    renamed,
    deleted,
    ...(notRead.length ? { notRead } : {}),
    ...(truncated.length ? { truncated } : {}),
    ...(deletionsSkipped === undefined ? {} : { deletionsSkipped }),
  }
}
