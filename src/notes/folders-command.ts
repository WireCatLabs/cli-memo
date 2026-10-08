import { statSync } from "node:fs"
import { resolve } from "node:path"
import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { type Command, InvalidArgumentError } from "commander"
import { loadConfig, updateConfig } from "../config.js"
import { DIALECTS, type DialectName } from "./dialects/index.js"
import { addFolder, attachFolder, type NoteFolder, noteFolders } from "./folders.js"

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

const line = (folder: NoteFolder) =>
  `${folder.id ?? "(no id — memo folders add <path>)"}  ${folder.format}  ${folder.path}`

export const foldersCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const print = (json: boolean | undefined, value: unknown, text: string) => {
    if (json) createRenderer({ format: "json", color: false, streams }).result(value)
    else streams.data(`${text}\n`)
  }
  const folders = program
    .command("folders")
    .description("Folders of notes: an id that links and the store use, and where the folder is on this computer")

  folders
    .command("add")
    .description("Give a folder of notes an id, or show the one it has")
    .argument("<path>", "the folder on this computer")
    .option("--format <format>", `how its notes are written: ${DIALECTS.join(", ")} (default: obsidian)`, formatOf)
    .option("--json", "print JSON")
    .action((path: string, options: { format?: DialectName; json?: boolean }) => {
      const at = directory(path)
      let result: ReturnType<typeof addFolder> | undefined
      updateConfig((config) => {
        result = addFolder(config, at, options.format)
        return result.config
      }, env)
      const { folder, created } = result as ReturnType<typeof addFolder>
      print(options.json, { ...folder, created }, folder.id as string)
    })

  folders
    .command("attach")
    .description("Bind a folder id from another computer to the folder's path on this one")
    .argument("<id>", "the folder's id, as memo folders add printed it")
    .argument("<path>", "the same folder on this computer")
    .option("--format <format>", `how its notes are written: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON")
    .action((id: string, path: string, options: { format?: DialectName; json?: boolean }) => {
      const at = directory(path)
      let folder: NoteFolder | undefined
      updateConfig((config) => {
        const result = attachFolder(config, id, at, options.format)
        folder = result.folder
        return result.config
      }, env)
      print(options.json, folder, line(folder as NoteFolder))
    })

  folders
    .command("list")
    .description("The folders of notes in the config, with their ids")
    .option("--json", "print JSON")
    .action((options: { json?: boolean }) => {
      const found = noteFolders(loadConfig(env).notes)
      print(options.json, { items: found }, found.map(line).join("\n") || "no folders: memo folders add <path>")
    })
}
