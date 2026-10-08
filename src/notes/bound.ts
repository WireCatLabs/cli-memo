import { resolve } from "node:path"
import { CliError } from "@leemour/cli-core"
import type { MessageStore } from "@leemour/cli-messaging/store"
import { loadConfig, updateConfig } from "../config.js"
import { bindFolder, type NoteFolder, noteFolders } from "./folders.js"

export type BoundFolder = NoteFolder & { id: string }

/**
 * A folder imported before store version 25 has an id but its path still waits in the store, which hands
 * it over once. It goes straight into this computer's config, so it is never lost between claim and save.
 */
export const claimPendingFolders = async (store: MessageStore, env: NodeJS.ProcessEnv): Promise<void> => {
  for (const folder of await store.notes.folders()) {
    if (folder.pendingPath === null) continue
    const { path } = await store.notes.claimFolderPath(folder.id)
    if (path === null) continue
    updateConfig((config) => {
      const here = noteFolders(config.notes).find((entry) => entry.path === resolve(path))
      if (here?.id && here.id !== folder.id) return config
      return bindFolder(config, { id: folder.id, path, format: here?.format ?? folder.format })
    }, env)
  }
}

const unbound = (path: string) =>
  new CliError(
    "configuration_error",
    `${path} has no folder id — memo folders add ${path}, or memo folders attach <id> ${path} if another computer made one`,
  )

/**
 * The configured folders the store knows, after claiming pending paths; `only` narrows them by path or id.
 * `strict` refuses a folder with no id — an import must not invent one — while a read just leaves it out.
 */
export const boundFolders = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  { only, strict = true }: { only?: string[]; strict?: boolean } = {},
): Promise<BoundFolder[]> => {
  await claimPendingFolders(store, env)
  const known = new Set((await store.notes.folders()).map(({ id }) => id))
  const configured = noteFolders(loadConfig(env).notes)
  const wanted =
    only === undefined
      ? configured
      : only.map((name) => {
          const found = configured.find((folder) => folder.id === name || folder.path === resolve(name))
          if (!found) throw unbound(resolve(name))
          return found
        })
  return wanted.flatMap((folder) => {
    if (folder.id !== null && known.has(folder.id)) return [folder as BoundFolder]
    if (strict) throw unbound(folder.path)
    return []
  })
}

/** The folder a file lies in, and its path inside it. */
export const folderOfFile = (folders: BoundFolder[], file: string): { folder: BoundFolder; path: string } => {
  const at = resolve(file)
  const folder = folders.find((candidate) => at.startsWith(`${candidate.path}/`))
  if (!folder) throw new CliError("not_found", `${at} is in no configured folder of notes`)
  return { folder, path: at.slice(folder.path.length + 1) }
}
