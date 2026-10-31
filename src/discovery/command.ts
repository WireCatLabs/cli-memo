import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import {
  annotate,
  type CommandInfo,
  commandsDocument,
  customizeSharedCommand,
  flatten,
} from "@wirecat/cli-base/commands"
import {
  addContractInfo,
  commandsText,
  DISCOVERY_DESCRIPTIONS,
  type DiscoveredCommand,
  environmentOf,
  type HelpSection,
  inSection,
  NO_EFFECTS,
  sharedCommandTemplate,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { APP } from "../app.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import { VERSION } from "../version.js"

/** The major version of the JSON memo's commands print; raise it when a field is removed or renamed. */
export const CONTRACT = 4

const commandsCommandDefinition = (program: Command, streams: Streams): void => {
  annotate(program.command("commands"), { effects: NO_EFFECTS })
    .argument("[path...]", "one command, such as tags add")
    .description(DISCOVERY_DESCRIPTIONS.commands)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((path: string[], options: { json?: boolean }) => {
      const annotateAvailability = (commands: readonly CommandInfo[]): DiscoveredCommand[] =>
        commands.map((info) => ({
          ...info,
          availability: environmentOf(program).discoveryAvailability?.(info),
          commands: annotateAvailability(info.commands),
        }))
      const plain = commandsDocument(program, { cli: "memo", version: VERSION, contract: CONTRACT })
      const document = { ...plain, commands: annotateAvailability(plain.commands) }
      const answer = path.length ? scoped(document, path) : document
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else {
        const found = path.length ? flatten(document.commands).find((item) => same(item.path, answer.scope)) : undefined
        streams.data(commandsText(program, found ? [found] : document.commands, found?.path))
      }
    })
}

const scoped = (document: ReturnType<typeof commandsDocument>, path: string[]) => {
  const all = flatten(document.commands)
  const found = all.find((item) => item.path.join(" ") === path.join(" "))
  if (!found) throw new CliError("not_found", "command path was not found")
  const inheritedOptions = all
    .filter((item) => item.path.length < path.length && item.path.every((word, index) => word === path[index]))
    .filter((item) => item.options.length > 0)
    .map((item) => ({ path: item.path, options: item.options }))
  return { ...document, scope: found.path, inherited_options: inheritedOptions, commands: [found] }
}

const same = (a: readonly string[], b: readonly string[] | undefined) => a.join(" ") === b?.join(" ")

// cli-core places its own groups (search, tags, tasks, meetings, mcp, skill…); these are memo's.
const SECTIONS: [string, HelpSection][] = [
  ["context", "read"],
  ["notes", "read"],
  ["notes add", "write"],
  ["notes edit", "write"],
  ["notes remove", "write"],
  ["notes export", "write"],
  ["mail", "read"],
  ["mail delete", "organise"],
  ["mail restore", "organise"],
  ["mail rules", "organise"],
  ["agents", "read"],
  ["answers", "read"],
  ["memories", "write"],
  ["facts", "write"],
  ["actions", "write"],
  ["notes links", "organise"],
  ["organizations", "organise"],
  ["projects", "organise"],
  ["people", "organise"],
  ["relationships", "organise"],
  ["reminders", "organise"],
  ["vocabulary", "organise"],
  ["sync", "automate"],
  ["jobs", "automate"],
  ["folders", "setup"],
  ["config", "setup"],
]

/** Where `memo commands` lists each group; run after every command is added. */
export const placeInSections = (program: Command): void => {
  for (const [path, section] of SECTIONS) {
    let command: Command | undefined = program
    for (const name of path.split(" ")) command = command?.commands.find((child) => child.name() === name)
    if (!command) throw new Error(`no command to place in a section: ${path}`)
    inSection(command, section)
  }
}

export const commandsCommand = (program: Command, streams: Streams): void => {
  customizeSharedCommand(
    sharedCommandTemplate(APP, "commands"),
    "Memo binds discovery to its command-local JSON renderer and scoped stored-data document format.",
    () => {
      commandsCommandDefinition(program, streams)
      addContractInfo(program, (value) => streams.data(JSON.stringify(value)))
      const command = program.commands.find((command) => command.name() === "commands")
      if (!command) throw new Error("discovery builder did not install its command")
      return command
    },
    SHELL_OVERRIDES.commands,
  )
}
