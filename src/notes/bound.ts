import { resolve } from "node:path"
import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"
import { loadConfig } from "../config.js"
import { type NoteFolder, noteFolders } from "./folders.js"

export type BoundFolder = NoteFolder & { id: string }

export const unboundReason = (path: string) =>
  `${path} has no folder id — memo folders add ${path}, or memo folders attach <id> ${path} if another computer made one`

const unbound = (path: string) => new CliError("configuration_error", unboundReason(path))

/**
 * The configured folders the store knows; `only` narrows them by path or id.
 * `strict` refuses a folder with no id — an import must not invent one — while a read just leaves it out.
 */
export const boundFolders = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  { only, strict = true }: { only?: string[]; strict?: boolean } = {},
): Promise<BoundFolder[]> => {
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

/** Folder ids for folders named by id, even one only another computer has, or by a configured path. */
export const folderIds = async (store: MessageStore, env: NodeJS.ProcessEnv, selected: string[]): Promise<string[]> => {
  const known = new Set((await store.notes.folders()).map(({ id }) => id))
  const paths = selected.filter((value) => !known.has(value))
  const bound = paths.length ? await boundFolders(store, env, { only: paths }) : []
  return [...new Set([...selected.filter((value) => known.has(value)), ...bound.map(({ id }) => id)])]
}

/** The folder a file lies in, and its path inside it. */
export const folderOfFile = (folders: BoundFolder[], file: string): { folder: BoundFolder; path: string } => {
  const at = resolve(file)
  const folder = folders.find((candidate) => at.startsWith(`${candidate.path}/`))
  if (!folder) throw new CliError("not_found", `${at} is in no configured folder of notes`)
  return { folder, path: at.slice(folder.path.length + 1) }
}
