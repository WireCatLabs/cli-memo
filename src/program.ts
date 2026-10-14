import { CliError, createRenderer, processStreams, type Streams } from "@wirecat/cli-base"
import { skillCommand } from "@wirecat/cli-base/skill"
import { Command } from "commander"
import { actionsCommand } from "./actions/command.js"
import { agentsCommand } from "./agents/command.js"
import { askCommand } from "./answers/command.js"
import { APP } from "./app.js"
import { contextCommand } from "./context/command.js"
import { commandsCommand } from "./discovery/command.js"
import { addExamples } from "./examples.js"
import { factsCommand } from "./facts/command.js"
import { knowledgeCommands } from "./knowledge/command.js"
import { mailCommand } from "./mail/command.js"
import { messagesCommand } from "./mail/messages-command.js"
import { mcpCommand } from "./mcp/command.js"
import { memoriesCommand } from "./memories/command.js"
import { notesCommand } from "./notes/command.js"
import { foldersCommand } from "./notes/folders-command.js"
import { noteCommand } from "./people/command.js"
import { autoCommand } from "./run/auto.js"
import { syncCommand } from "./run/import.js"
import { searchCommand } from "./search/command.js"
import { tagsCommand } from "./tags/command.js"
import { tasksCommand } from "./tasks/command.js"
import { VERSION } from "./version.js"
import { vocabularyCommand } from "./vocabulary/command.js"

export const createProgram = ({
  streams = processStreams,
  env = process.env,
}: {
  streams?: Streams
  env?: NodeJS.ProcessEnv
} = {}): Command => {
  const program = new Command("memo")
    .description("context about people across messengers, notes and mail")
    .version(VERSION)

  contextCommand(program, streams, env)
  notesCommand(program, streams, env)
  foldersCommand(program, streams, env)
  messagesCommand(program, streams, env)
  mailCommand(program, streams, env)
  noteCommand(program, streams, env)
  tagsCommand(program, streams, env)
  tasksCommand(program, streams, env)
  knowledgeCommands(program, streams, env)
  vocabularyCommand(program, streams, env)
  memoriesCommand(program, streams, env)
  factsCommand(program, streams, env)
  actionsCommand(program, streams, env)
  agentsCommand(program, streams, env)
  mcpCommand(program, streams, env)
  searchCommand(program, streams, env)
  askCommand(program, streams, env)
  syncCommand(program, streams, env)
  autoCommand(program, streams, env)
  commandsCommand(program, streams)
  program.addCommand(
    skillCommand(APP, new URL("../skills/cli-memo/SKILL.md", import.meta.url), () => ({
      renderer: createRenderer({ format: "pretty", color: false, streams }),
      streams,
      env,
    })),
  )
  addExamples(program)

  return program
}

/**
 * Commander settles `--help` for an unknown first word before any hook runs, so `"projects add" --help` —
 * a shell loop over `"$c"` passes it whole — printed the root help. Checked on the words before parsing.
 */
export const refuseJoinedPath = (program: Command, args: readonly string[]): void => {
  let command = program
  const path: string[] = []
  for (const arg of args) {
    if (arg.startsWith("-")) return
    const [first = "", ...rest] = arg.trim().split(/\s+/)
    const next = command.commands.find((child) => child.name() === first || child.aliases().includes(first))
    if (next === undefined) return
    if (rest.length > 0)
      throw new CliError(
        "validation_error",
        `"${arg}" was given as one argument; run: ${[program.name(), ...path, first, ...rest].join(" ")}`,
      )
    path.push(first)
    command = next
  }
}
