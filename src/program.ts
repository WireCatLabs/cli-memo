import { processStreams, type Streams } from "@leemour/cli-core"
import { Command } from "commander"
import { contextCommand } from "./context/command.js"
import { mailCommand } from "./mail/command.js"
import { notesCommand } from "./notes/command.js"
import { noteCommand } from "./people/command.js"
import { autoCommand } from "./run/auto.js"
import { importCommand } from "./run/import.js"
import { tagsCommand } from "./tags/command.js"
import { VERSION } from "./version.js"

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

  contextCommand(program, streams, env)
  notesCommand(program, streams, env)
  mailCommand(program, streams, env)
  noteCommand(program, streams, env)
  tagsCommand(program, streams, env)
  importCommand(program, streams, env)
  autoCommand(program, streams, env)

  return program
}
