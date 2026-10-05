import { join } from "node:path"
import { loadConfigFile, resolvePaths, saveConfigFile } from "@leemour/cli-core"
import * as v from "valibot"

const NotesMapSchema = v.record(v.string(), v.string())

/** Person uid → the note about them: the one link the store cannot hold (ruling NEED-596). */
export type NotesMap = v.InferOutput<typeof NotesMapSchema>

const path = (env: NodeJS.ProcessEnv): string =>
  join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).config, "people-notes.json")

export const loadNotesMap = (env: NodeJS.ProcessEnv = process.env): NotesMap =>
  loadConfigFile(path(env), NotesMapSchema, () => ({}))

export const saveNotesMap = (map: NotesMap, env: NodeJS.ProcessEnv = process.env): void =>
  saveConfigFile(path(env), map)
