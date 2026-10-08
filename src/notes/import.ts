import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { basename, dirname, extname, relative, resolve, sep } from "node:path"
import type { Chat, Message } from "@leemour/cli-messaging"
import { extractText, importEngine, type LoadEngine, MAX_FILE_BYTES } from "@leemour/cli-messaging/documents"
import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"
import { dropMissing } from "../store/gone.js"
import { noteFiles } from "./files.js"

export interface NotesImport {
  folder: string
  notes: number
  /** Saved because they are new or their text changed. */
  changed: number
  /** Chats (folders) a note was saved or deleted in: what needs building and embedding again. */
  chats: string[]
  deleted: number
  deletionsSkipped?: string
  notRead?: { path: string; status: string; engine?: string }[]
  truncated?: string[]
}

const MAX_TEXT = 200_000
const ROOT = "."
const MANIFEST = "manifest"
const MAX_DELETED_SHARE = 0.2
const MIN_DELETIONS_CAPPED = 5

/** The store's account for a folder of notes: its absolute path, so two vaults never mix. */
export const notesKey = (folder: string): AccountKey => ({ provider: "notes", account: resolve(folder) })

/** Path inside the folder → `mtimeMs:size:sha256` of the file as last stored. */
type Manifest = Record<string, string>

const inside = (folder: string, path: string): string => relative(folder, path).split(sep).join("/")
const chatOf = (id: string): string => (dirname(id) === "." ? ROOT : dirname(id))

const noteMessage = (id: string, path: string, text: string, modified: string): Message => ({
  id,
  chatId: chatOf(id),
  senderId: null,
  senderName: null,
  timestamp: modified,
  editedAt: null,
  text: `${basename(path).replace(/\.(md|txt)$/i, "")}\n\n${text.replace(/\r\n?/g, "\n")}`.slice(0, MAX_TEXT),
  outgoing: true,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

/**
 * Each note is one stored message of the `notes` provider: the folder is the account, each subfolder a
 * chat, the path inside the folder the message id. A manifest in the store's sync state says what each
 * file was when last stored, so an untouched file is not even read and an identical one is not saved; an
 * edit keeps the old text as a revision, and a note gone from the folder (or newly ignored) loses its text.
 */
export const importNotes = async (
  store: MessageStore,
  folder: string,
  {
    ignore = [],
    now = Date.now,
    loadEngine = importEngine,
  }: { ignore?: string[]; now?: () => number; loadEngine?: LoadEngine } = {},
): Promise<NotesImport> => {
  const root = resolve(folder)
  const key = notesKey(root)
  const seenAt = now()
  const stored = await store.syncState(key, MANIFEST)
  const before: Manifest | undefined = stored === undefined ? undefined : (JSON.parse(stored.value) as Manifest)
  const after: Manifest = {}
  const changed = new Map<string, Message[]>()
  const newest = new Map<string, string>()
  const notRead: NonNullable<NotesImport["notRead"]> = []
  const truncated: string[] = []

  const files = noteFiles(root, ignore)
  const listed = files.length
  for (const path of files) {
    const id = inside(root, path)
    const stat = statSync(path)
    const modified = stat.mtime.toISOString()
    const chat = chatOf(id)
    if (modified > (newest.get(chat) ?? "")) newest.set(chat, modified)
    const stamp = `${stat.mtimeMs}:${stat.size}:`
    const previous = before?.[id]
    if (stat.size > MAX_FILE_BYTES) {
      after[id] = previous ?? stamp
      notRead.push({ path: id, status: "too-large" })
      if (previous) await store.markDeleted(key, [id], { chatId: chat })
      continue
    }
    const bytes = readFileSync(path)
    const hash = createHash("sha256").update(bytes).digest("hex")
    after[id] = `${stamp}${hash}`
    if (previous?.endsWith(`:${hash}`) && (await store.message(key, id, { chatId: chat }))) continue
    const extraction = await extractText(bytes, { kind: "file", name: basename(path), mime: null, path }, loadEngine)
    if (extraction.status !== "extracted") {
      notRead.push({
        path: id,
        status: extraction.status,
        ...("engine" in extraction ? { engine: extraction.engine } : {}),
      })
      after[id] = previous ?? stamp
      if (previous) await store.markDeleted(key, [id], { chatId: chat })
      continue
    }
    const text = extraction.text
    if (extraction.truncated || text.length + basename(path).length + 2 > MAX_TEXT) truncated.push(id)
    await store.setSyncState(
      key,
      `document:${id}`,
      JSON.stringify({
        extractor: extraction.extractor,
        hash,
        format: extname(path),
        provenance: extname(path).toLowerCase() === ".xlsx" ? "sheet-cell" : "source-text",
        truncated: truncated.includes(id),
        ...("spans" in extraction && extraction.spans ? { spans: extraction.spans } : {}),
        ...("cells" in extraction && extraction.cells ? { cells: extraction.cells } : {}),
      }),
    )
    changed.set(chat, [...(changed.get(chat) ?? []), noteMessage(id, path, text, modified)])
  }

  if (before === undefined) await store.saveAccount(key, { name: basename(root) })
  if (changed.size > 0) {
    const chats: Chat[] = [...changed.keys()].map((id) => ({
      id,
      title: id === ROOT ? basename(root) : id,
      kind: "saved",
      unreadCount: null,
      lastMessageAt: newest.get(id) ?? null,
      participantsCount: null,
    }))
    await store.applyDelta(key, { chats })
    for (const [chatId, notes] of changed) await store.saveMessages(key, chatId, notes, { via: "cli-memo", seenAt })
  }

  // Before the first manifest, what is stored can only be learnt from the store itself.
  const gone =
    before === undefined
      ? await dropMissing(store, key, new Set(Object.keys(after)))
      : await dropGone(store, key, before, after)
  if (gone.skipped !== undefined && before !== undefined) {
    // Kept in the manifest, so the next run weighs them again rather than forgetting them.
    for (const id of Object.keys(before)) after[id] ??= before[id] as string
  }
  if (JSON.stringify(after) !== stored?.value) await store.setSyncState(key, MANIFEST, JSON.stringify(after))

  return {
    folder: root,
    notes: listed,
    changed: [...changed.values()].reduce((sum, notes) => sum + notes.length, 0),
    chats: [
      ...new Set([
        ...changed.keys(),
        ...(gone.deleted > 0
          ? Object.keys(before ?? {})
              .filter((id) => !(id in after))
              .map(chatOf)
          : []),
      ]),
    ],
    deleted: gone.deleted,
    ...(notRead.length ? { notRead } : {}),
    ...(truncated.length ? { truncated } : {}),
    ...(gone.skipped === undefined ? {} : { deletionsSkipped: gone.skipped }),
  }
}

/** Gone = in the manifest, not in the folder. A large share missing at once is refused, as for mail. */
const dropGone = async (
  store: MessageStore,
  key: AccountKey,
  before: Manifest,
  after: Manifest,
): Promise<{ deleted: number; skipped?: string }> => {
  const gone = Object.keys(before).filter((id) => !(id in after))
  if (gone.length === 0) return { deleted: 0 }
  const known = Object.keys(before).length
  if (gone.length >= MIN_DELETIONS_CAPPED && gone.length > known * MAX_DELETED_SHARE)
    return {
      deleted: 0,
      skipped: `${gone.length} of ${known} stored notes are missing from the folder — too many to trust; nothing deleted`,
    }
  const byChat = new Map<string, string[]>()
  for (const id of gone) byChat.set(chatOf(id), [...(byChat.get(chatOf(id)) ?? []), id])
  let deleted = 0
  for (const [chatId, ids] of byChat) deleted += await store.markDeleted(key, ids, { chatId })
  return { deleted }
}
