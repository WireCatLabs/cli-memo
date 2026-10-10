import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePaths } from "@wirecat/cli-core"

/**
 * What one computer last saw of a folder. It is kept here, not in the shared store: a file's change time
 * belongs to this disk, and another computer's copy of the folder has its own.
 */
export interface FolderState {
  /** Path inside the folder → `mtimeMs:size:sha256`; `memo:` in front for a file memo exported. */
  files: Record<string, string>
  /** Where the text of a PDF, sheet or document came from inside it. */
  documents: Record<string, unknown>
}

const empty = (): FolderState => ({ files: {}, documents: {} })

const fileOf = (env: NodeJS.ProcessEnv, id: string) =>
  join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).state, "folders", `${id}.json`)

/** `undefined` before this computer's first import of the folder. */
export const loadFolderState = (env: NodeJS.ProcessEnv, id: string): FolderState | undefined => {
  try {
    return { ...empty(), ...(JSON.parse(readFileSync(fileOf(env, id), "utf8")) as Partial<FolderState>) }
  } catch {
    return undefined
  }
}

export const saveFolderState = (env: NodeJS.ProcessEnv, id: string, state: FolderState): void => {
  const file = fileOf(env, id)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(state))
  renameSync(`${file}.tmp`, file)
}
