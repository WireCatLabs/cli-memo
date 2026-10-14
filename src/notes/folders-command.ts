import { statSync } from "node:fs"
import { basename, resolve } from "node:path"
import { CliError, type Streams } from "@wirecat/cli-base"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { loadConfig, updateConfig } from "../config.js"
import { DIALECTS, type DialectName } from "./dialects/index.js"
import { attachFolder, bindFolder, type NoteFolder, noteFolders } from "./folders.js"

const formatOf = (value: string): DialectName => {
  if (!(DIALECTS as readonly string[]).includes(value)) throw new InvalidArgumentError(`choose ${DIALECTS.join(", ")}`)
  return value as DialectName
}

const directory = (path: string): string => {
  const at = resolve(path)
  let isDirectory = false
  try {
    isDirectory = statSync(at).isDirectory()
  } catch {}
  if (!isDirectory) throw new CliError("not_found", `${at} is not a folder`)
  return at
}

// drive-cli owns these folders; bound to a disk folder, an import would delete the Drive documents missing there.
const keptByDrive = (name: string) => name.startsWith("google-drive:")

const line = (folder: NoteFolder) =>
  `${folder.id ?? "(no id — memo folders add <path>)"}  ${folder.format}  ${folder.path}`

interface ElsewhereFolder {
  id: string
  name: string
  format: string
  path: null
  keptBy?: "drive"
}

export const foldersCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const folders = program
    .command("folders")
    .description("folders of notes: the id links and the store use, and the path on this computer")

  folders
    .command("add")
    .description("give a folder of notes an id, or show the one it has")
    .argument("<path>", "the folder on this computer")
    .option("--format <format>", `how its notes are written: ${DIALECTS.join(", ")} (default: obsidian)`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (path: string, options: { format?: DialectName; json?: boolean }) => {
      const at = directory(path)
      const answer = await withStore(env, async (store) => {
        const known = new Set((await store.notes.folders()).map(({ id }) => id))
        const current = noteFolders(loadConfig(env).notes).find((folder) => folder.path === at)
        if (current?.id && known.has(current.id)) {
          const folder = { ...current, id: current.id, format: options.format ?? current.format }
          if (folder.format !== current.format) updateConfig((config) => bindFolder(config, folder), env)
          return { ...folder, created: false }
        }
        const format = options.format ?? current?.format ?? "obsidian"
        const made = await store.notes.addFolder({ name: basename(at) || at, format })
        const folder = { id: made.id, path: at, format }
        updateConfig((config) => bindFolder(config, folder), env)
        return { ...folder, created: true }
      })
      print(options.json, itemAnswer(answer), answer.id)
    })

  folders
    .command("attach")
    .description("bind a folder id from another computer to the folder's path on this one")
    .argument("<id>", "the folder's id, as memo folders add printed it")
    .argument("<path>", "the same folder on this computer")
    .option("--format <format>", `how its notes are written: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, path: string, options: { format?: DialectName; json?: boolean }) => {
      const at = directory(path)
      const folder = await withStore(env, async (store) => {
        const stored = (await store.notes.folders()).find((candidate) => candidate.id === id)
        if (!stored)
          throw new CliError("not_found", `the store has no folder ${id} — memo folders list shows those it has`, {
            reason: "folder.not-found",
          })
        if (keptByDrive(stored.name))
          throw new CliError(
            "validation_error",
            `folder ${id} is Google Drive's (${stored.name}) — drive keeps it, and memo search already reads it`,
          )
        let bound: NoteFolder | undefined
        updateConfig((config) => {
          const result = attachFolder(config, id, at, options.format ?? stored.format)
          bound = result.folder
          return result.config
        }, env)
        return bound as NoteFolder
      })
      print(options.json, itemAnswer(folder), line(folder))
    })

  folders
    .command("list")
    .description("folders of notes on this computer, and those the store knows from another")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { json?: boolean }) => {
      const here = noteFolders(loadConfig(env).notes)
      const elsewhere: ElsewhereFolder[] = await withStore(env, async (store) =>
        (await store.notes.folders())
          .filter((folder) => !here.some((entry) => entry.id === folder.id))
          .map(({ id, name, format }) => ({
            id,
            name,
            format,
            path: null,
            ...(keptByDrive(name) ? { keptBy: "drive" as const } : {}),
          })),
      )
      print(
        options.json,
        wholeList("folders list", [...here, ...elsewhere]),
        [
          ...here.map(line),
          ...elsewhere.map(({ id, name, keptBy }) =>
            keptBy
              ? `${id}  kept by drive (${name})`
              : `${id}  not on this computer (${name}) — memo folders attach ${id} <path>`,
          ),
        ].join("\n") || "no folders: memo folders add <path>",
      )
    })
}
