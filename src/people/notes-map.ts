import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { loadConfigFile, resolvePaths } from "@wirecat/cli-core"
import type { MessageStore } from "@wirecat/cli-messaging/store"
import * as v from "valibot"
import { type BoundFolder, folderOfFile } from "../notes/bound.js"
import { folderNotes } from "../notes/import.js"

const NotesMapSchema = v.record(v.string(), v.string())

/** Person uid → the note about them, as `memo note` kept it before the store could hold the link. */
export type NotesMap = v.InferOutput<typeof NotesMapSchema>

const mapPath = (env: NodeJS.ProcessEnv): string =>
  join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).config, "people-notes.json")

const donePath = (env: NodeJS.ProcessEnv): string =>
  join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).state, "people-notes-imported.json")

/**
 * Moves each entry of the old `people-notes.json` into the store as an `about` link, once. An entry whose
 * note is not imported yet waits for a later run; the file itself is left as the owner wrote it.
 */
export const importNotesMap = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  folders: BoundFolder[],
): Promise<number> => {
  if (!existsSync(mapPath(env))) return 0
  const map = loadConfigFile(mapPath(env), NotesMapSchema, () => ({}))
  let done: string[] = []
  try {
    done = JSON.parse(readFileSync(donePath(env), "utf8")) as string[]
  } catch {}
  const pending = Object.entries(map).filter(([uid]) => !done.includes(uid))
  if (pending.length === 0) return 0
  const byFolder = new Map<string, Map<string, string>>()
  let linked = 0
  for (const [uid, file] of pending) {
    let place: ReturnType<typeof folderOfFile>
    try {
      place = folderOfFile(folders, file)
    } catch {
      continue
    }
    if (!byFolder.has(place.folder.id))
      byFolder.set(
        place.folder.id,
        new Map((await folderNotes(store, place.folder.id)).map((note) => [note.path as string, note.id])),
      )
    const id = byFolder.get(place.folder.id)?.get(place.path)
    if (id === undefined) continue
    await store.notes.addLink({ from: `note:${id}`, to: `person:${uid}`, kind: "about", origin: "owner" })
    done.push(uid)
    linked++
  }
  mkdirSync(join(donePath(env), ".."), { recursive: true })
  writeFileSync(donePath(env), JSON.stringify(done))
  return linked
}
