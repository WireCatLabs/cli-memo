import { CliError, createRenderer, processStreams, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { skillCommand } from "@wirecat/cli-base/skill"
import { entityFields, NO_EFFECTS } from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { actionsCommand } from "./actions/command.js"
import { agentsCommand } from "./agents/command.js"
import { trackAnswers } from "./answer.js"
import { askCommand } from "./answers/command.js"
import { APP } from "./app.js"
import { contextCommand } from "./context/command.js"
import { commandsCommand } from "./discovery/command.js"
import { doctorCommand } from "./doctor/command.js"
import { addExamples } from "./examples.js"
import { factsCommand } from "./facts/command.js"
import { findingsCommand } from "./findings/command.js"
import { jsonFields } from "./json-fields.js"
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
import { upgradeCommand } from "./update.js"
import { VERSION } from "./version.js"
import { vocabularyCommand } from "./vocabulary/command.js"

/** memo's own answers, beyond cli-core's entities, so `--json=<field>` is checked against what each row holds. */
const OWN_ENTITIES = entityFields({
  source_tag: [
    "provider",
    "account",
    "tag",
    "type",
    "chat_id",
    "chat_title",
    "person_id",
    "name",
    "message_id",
    "locator",
    "task_id",
    "sources",
    "created_at",
    "id",
    "path",
    "origin",
  ],
  vocabulary: ["entries", "fingerprint", "coverage"],
  proposed_action: [
    "id",
    "kind",
    "account",
    "target",
    "payload",
    "reason",
    "status",
    "proposed_by",
    "decided_by",
    "decided_at",
    "executed_at",
    "result",
    "error",
    "verdict",
    "created_at",
  ],
  agent_action: ["id", "actor", "tool", "tier", "target", "status", "error", "started_at", "finished_at"],
  meeting_project: ["id", "meeting", "project", "confirmed", "provenance", "fingerprint"],
  notes_folder: ["id", "name", "path", "format", "kept_by"],
})

export const createProgram = ({
  streams: raw = processStreams,
  env = process.env,
}: {
  streams?: Streams
  env?: NodeJS.ProcessEnv
} = {}): Command => {
  const fields = jsonFields(raw, OWN_ENTITIES)
  const { streams } = fields
  const program = new Command("memo")
    .description("context about people across messengers, notes and mail")
    .version(VERSION)
    .option("--debug", "on failure, show the full error record: cause and stack")

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
  findingsCommand(program, streams, env)
  actionsCommand(program, streams, env)
  agentsCommand(program, streams, env)
  mcpCommand(program, streams, env)
  searchCommand(program, streams, env)
  askCommand(program, streams, env)
  syncCommand(program, streams, env)
  autoCommand(program, streams, env)
  doctorCommand(program, streams, env)
  program.addCommand(upgradeCommand(streams))
  commandsCommand(program, streams)
  const skill = skillCommand(APP, new URL("../skills/cli-memo/SKILL.md", import.meta.url), () => ({
    renderer: createRenderer({ format: "pretty", color: false, streams }),
    streams,
    env,
  }))
  const show = skill.commands.find((command) => command.name() === "show")
  // cli-base declares a local read; the text memo prints ships inside the package.
  if (show) annotate(show, { effects: NO_EFFECTS })
  program.addCommand(skill)
  addExamples(program)
  fields.install(program)
  trackAnswers(program)

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
