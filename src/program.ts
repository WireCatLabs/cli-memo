import { createRenderer, processStreams, type Streams } from "@leemour/cli-core"
import { Command, InvalidArgumentError } from "commander"
import { loadConfig } from "./config.js"
import { mailCommand } from "./mail/command.js"
import { findNotes } from "./notes/read.js"
import { notesText } from "./notes/text.js"
import { noteCommand } from "./people/command.js"
import { VERSION } from "./version.js"

const positive = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new InvalidArgumentError("a whole number above zero")
  return number
}

export const createProgram = ({
  streams = processStreams,
  env = process.env,
}: {
  streams?: Streams
  env?: NodeJS.ProcessEnv
} = {}): Command => {
  const program = new Command("memo")
    .description("Context about people across messengers, notes and mail")
    .version(VERSION)

  program
    .command("notes")
    .description("Notes about a person, notes that link them, and weak plain-name mentions")
    .argument("<name>", "the person's name, as in the note's file name or its aliases")
    .option("--folder <path...>", "folders of Markdown notes to read (default: notes.folders in the config)")
    .option("--limit <n>", "most links and mentions to show of each kind", positive, 20)
    .option("--json", "print JSON")
    .action((name: string, options: { folder?: string[]; limit: number; json?: boolean }) => {
      const folders = options.folder ?? loadConfig(env).notes?.folders ?? []
      const answer =
        folders.length === 0
          ? {
              ...findNotes([], name),
              complete: false,
              notRead: [{ folder: "", reason: "no folders: pass --folder or set notes.folders in the config" }],
            }
          : findNotes(folders, name, options.limit)
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${notesText(answer)}\n`)
    })

  mailCommand(program, streams, env)
  noteCommand(program, streams, env)

  return program
}
