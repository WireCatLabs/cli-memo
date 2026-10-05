import { processStreams, type Streams } from "@leemour/cli-core"
import { Command } from "commander"
import { mailCommand } from "./mail/command.js"
import { notesCommand } from "./notes/command.js"
import { noteCommand } from "./people/command.js"
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

  notesCommand(program, streams, env)
  mailCommand(program, streams, env)
  noteCommand(program, streams, env)

  return program
}
