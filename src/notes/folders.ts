import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { CliError } from "@leemour/cli-core"
import type { Config } from "../config.js"
import type { DialectName } from "./dialects/index.js"

/**
 * A folder of notes on this computer. The id is what the store and every link use; the path is only
 * where the folder is here, so the same folder can live elsewhere on another computer.
 */
export interface NoteFolder {
  /** `null` for a folder still written as a bare path, until `memo folders add` gives it an id. */
  id: string | null
  path: string
  format: DialectName
}

type Entry = NonNullable<Config["notes"]>["folders"][number]

const entryOf = (entry: Entry): NoteFolder =>
  typeof entry === "string"
    ? { id: null, path: resolve(entry), format: "obsidian" }
    : { id: entry.id, path: resolve(entry.path), format: entry.format ?? "obsidian" }

export const noteFolders = (notes: Config["notes"]): NoteFolder[] => (notes?.folders ?? []).map(entryOf)

export const folderPaths = (notes: Config["notes"]): string[] => noteFolders(notes).map(({ path }) => path)

const newId = () => `fld_${randomUUID().replace(/-/g, "")}`

const written = (folder: NoteFolder): Entry => ({
  id: folder.id as string,
  path: folder.path,
  ...(folder.format === "obsidian" ? {} : { format: folder.format }),
})

const withFolders = (config: Config, folders: NoteFolder[]): Config => ({
  ...config,
  notes: {
    ...config.notes,
    folders: folders.map((folder) => (folder.id === null ? folder.path : written(folder))),
  },
})

/** Gives the folder at `path` an id, keeping the one it has. A bare path in the config becomes an entry. */
export const addFolder = (
  config: Config,
  path: string,
  format?: DialectName,
): { config: Config; folder: NoteFolder; created: boolean } => {
  const at = resolve(path)
  const folders = noteFolders(config.notes)
  const index = folders.findIndex((folder) => folder.path === at)
  const current = folders[index]
  if (current?.id) {
    if (format === undefined || format === current.format) return { config, folder: current, created: false }
    const folder = { ...current, format }
    return { config: withFolders(config, folders.with(index, folder)), folder, created: false }
  }
  const folder: NoteFolder = { id: newId(), path: at, format: format ?? current?.format ?? "obsidian" }
  const next = index < 0 ? [...folders, folder] : folders.with(index, folder)
  return { config: withFolders(config, next), folder, created: true }
}

/**
 * Binds a folder id made elsewhere to its path on this computer. An id already here moves to the new
 * path; a path already bound to another id is refused, since its notes would change identity.
 */
export const attachFolder = (
  config: Config,
  id: string,
  path: string,
  format?: DialectName,
): { config: Config; folder: NoteFolder } => {
  const at = resolve(path)
  const folders = noteFolders(config.notes)
  const taken = folders.find((folder) => folder.path === at && folder.id !== null && folder.id !== id)
  if (taken)
    throw new CliError(
      "validation_error",
      `${at} is already folder ${taken.id} — attach that id elsewhere first, or remove it from the config`,
    )
  const previous = folders.find((folder) => folder.id === id)
  const folder: NoteFolder = { id, path: at, format: format ?? previous?.format ?? "obsidian" }
  const kept = folders.filter((other) => other.id !== id && other.path !== at)
  return { config: withFolders(config, [...kept, folder]), folder }
}
