import { fileURLToPath } from "node:url"
import { CliError, createRenderer, processStreams, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { skillCommand } from "@wirecat/cli-base/skill"
import { entityFields, environmentOf, guideCommand, installHelp, NO_EFFECTS, provide } from "@wirecat/cli-core/cli"
import { Command } from "commander"
import { actionsCommand } from "./actions/command.js"
import { agentsCommand } from "./agents/command.js"
import { trackAnswers } from "./answer.js"
import { askCommand } from "./answers/command.js"
import { APP } from "./app.js"
import { contextCommand } from "./context/command.js"
import { commandsCommand, placeInSections } from "./discovery/command.js"
import { doctorCommand } from "./doctor/command.js"
import { addExamples } from "./examples.js"
import { factsCommand } from "./facts/command.js"
import { findingsCommand } from "./findings/command.js"
import { jsonFields } from "./json-fields.js"
import { knowledgeCommands } from "./knowledge/command.js"
import { mailCommand } from "./mail/command.js"
import { messagesCommand } from "./mail/messages-command.js"
import { mcpCommand } from "./mcp/command.js"
import { meetingReadCommands } from "./meetings/command.js"
import { meetingPreparationCommand } from "./meetings/preparation-command.js"
import { memoriesCommand } from "./memories/command.js"
import { mentionsCommand } from "./mentions/command.js"
import { modelsCommand } from "./models/command.js"
import { notesCommand } from "./notes/command.js"
import { foldersCommand } from "./notes/folders-command.js"
import { noteCommand } from "./people/command.js"
import { readOnlyAvailability, refuseWritesUnderLock } from "./read-only.js"
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
  person_note_links: ["person", "name", "files"],
  project_annotation_snapshot: ["snapshot", "fingerprint", "coverage", "read_bytes", "records"],
  project_annotation_export: [
    "output_file",
    "project",
    "manifest_fingerprint",
    "coverage",
    "counts",
    "read_bytes",
    "records",
  ],
  project_annotation_transfer: [
    "plan",
    "descriptor_conflicts",
    "namespace_conflicts",
    "ready",
    "fingerprint",
    "read_bytes",
    "records",
    "project",
    "mappings",
    "counts",
  ],
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
  meeting_context: [
    "schema_version",
    "kind",
    "source",
    "target_ref",
    "target_fingerprint",
    "fingerprint",
    "revision",
    "limits",
    "content_bytes",
    "coverage",
    "items",
  ],
  vocabulary_inspection: [
    "source",
    "survivor",
    "vocabulary_fingerprint",
    "preview_fingerprint",
    "assignments",
    "aliases",
    "automatic_claims",
    "links",
    "coverage",
  ],
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

const FIRST_SCREEN = {
  pitch: "your notes, mail and messages in one local store, linked to people; every answer cites its source.",
  can: [
    { command: "context <person>", does: "one person's messages, mail, notes and tasks" },
    { command: 'search all "budget"', does: "messages, mail and notes ranked together" },
    { command: 'ask "…" --all', does: "evidence with sources, ready for your agent" },
    { command: "tasks agenda", does: "overdue tasks, replies you owe and wait for" },
    { command: "meetings prepare <series-id>", does: "a briefing with sources for a meeting" },
    { command: "jobs start", does: "sync notes and mail every 5 minutes" },
    { command: "agents list", does: "every agent tool call, without its arguments" },
    { command: "mcp", does: "search, people, memories and facts for any MCP agent" },
  ],
  profile: false,
  start: "memo folders add <path>",
}

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
  refuseWritesUnderLock(program, env)

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
  mentionsCommand(program, streams, env)
  factsCommand(program, streams, env)
  findingsCommand(program, streams, env)
  actionsCommand(program, streams, env)
  agentsCommand(program, streams, env)
  mcpCommand(program, streams, env, createProgram)
  modelsCommand(program, streams, env)
  searchCommand(program, streams, env)
  meetingReadCommands(program, streams, env)
  meetingPreparationCommand(program, streams, env)
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
  // tg and max have a global --json; memo's is per command, so guide gets its own.
  program.addCommand(
    guideCommand(APP, { directory: fileURLToPath(new URL("../scenarios", import.meta.url)), profile: false }).option(
      "--json",
      "print JSON",
    ),
  )
  addExamples(program)
  fields.install(program)
  trackAnswers(program)
  placeInSections(program)
  installHelp(program, FIRST_SCREEN)
  provide(program, {
    ...environmentOf(program),
    discoveryAvailability: (info) => {
      let command: Command | undefined = program
      for (const word of info.path) command = command?.commands.find((child) => child.name() === word)
      return command ? readOnlyAvailability(command, env) : undefined
    },
  })

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
