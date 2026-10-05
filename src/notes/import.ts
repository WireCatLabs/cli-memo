import { readFileSync, statSync } from "node:fs"
import { basename, dirname, relative, resolve, sep } from "node:path"
import type { Chat, Message } from "@leemour/cli-messaging"
import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"
import { dropMissing } from "../store/gone.js"
import { noteFiles } from "./files.js"

export interface NotesImport {
  folder: string
  notes: number
  deleted: number
  deletionsSkipped?: string
}

const MAX_TEXT = 200_000
const ROOT = "."

/** The store's account for a folder of notes: its absolute path, so two vaults never mix. */
export const notesKey = (folder: string): AccountKey => ({ provider: "notes", account: resolve(folder) })

const inside = (folder: string, path: string): string => relative(folder, path).split(sep).join("/")

/**
 * Each note is one stored message of the `notes` provider: the folder is the account, each subfolder a
 * chat, the path inside the folder the message id. Every run saves every note — an edit keeps the old
 * text as a revision — and a note gone from the folder loses its text.
 */
export const importNotes = async (
  store: MessageStore,
  folder: string,
  { ignore = [], now = Date.now }: { ignore?: string[]; now?: () => number } = {},
): Promise<NotesImport> => {
  const root = resolve(folder)
  const key = notesKey(root)
  const seenAt = now()
  const files = noteFiles(root, ignore)
  await store.saveAccount(key, { name: basename(root) })

  const byChat = new Map<string, Message[]>()
  for (const path of files) {
    const id = inside(root, path)
    const chatId = dirname(id) === "." ? ROOT : dirname(id)
    const title = basename(path).replace(/\.(md|txt)$/i, "")
    const body = readFileSync(path, "utf8").replace(/\r\n?/g, "\n")
    const modified = statSync(path).mtime.toISOString()
    byChat.set(chatId, [
      ...(byChat.get(chatId) ?? []),
      {
        id,
        chatId,
        senderId: null,
        senderName: null,
        timestamp: modified,
        editedAt: null,
        text: `${title}\n\n${body}`.slice(0, MAX_TEXT),
        outgoing: true,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ])
  }

  const chats: Chat[] = [...byChat].map(([id, notes]) => ({
    id,
    title: id === ROOT ? basename(root) : id,
    kind: "saved",
    unreadCount: null,
    lastMessageAt: notes.reduce((newest, { timestamp }) => (timestamp > newest ? timestamp : newest), ""),
    participantsCount: null,
  }))
  await store.applyDelta(key, { chats })
  for (const [chatId, notes] of byChat) await store.saveMessages(key, chatId, notes, { via: "cli-memo", seenAt })

  const gone = await dropMissing(store, key, new Set(files.map((path) => inside(root, path))))
  return {
    folder: root,
    notes: files.length,
    deleted: gone.deleted,
    ...(gone.skipped === undefined ? {} : { deletionsSkipped: gone.skipped }),
  }
}
