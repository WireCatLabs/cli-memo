import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import { annotate, commandsDocument, describeProgram, flatten } from "@wirecat/cli-base/commands"
import { commandsText, type HelpSection, inSection, NO_EFFECTS } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { VERSION } from "../version.js"

/** The major version of the JSON memo's commands print; raise it when a field is removed or renamed. */
export const CONTRACT = 4

export const commandsCommand = (program: Command, streams: Streams): void => {
  annotate(program.command("commands"), { effects: NO_EFFECTS })
    .argument("[path...]", "one command, such as tags add")
    .description("discover the command tree and options as shared registry data")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((path: string[], options: { json?: boolean }) => {
      const document = commandsDocument(program, { cli: "memo", version: VERSION, contract: CONTRACT })
      const answer = path.length ? scoped(document, path) : document
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else {
        const found = path.length
          ? flatten(describeProgram(program)).find((item) => same(item.path, answer.scope))
          : undefined
        streams.data(commandsText(program, found ? [found] : describeProgram(program), found?.path))
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
  ["mail trash", "organise"],
  ["mail restore", "organise"],
  ["mail rules", "organise"],
  ["agents", "read"],
  ["ask", "read"],
  ["memories", "write"],
  ["facts", "write"],
  ["actions", "write"],
  ["note", "organise"],
  ["organizations", "organise"],
  ["projects", "organise"],
  ["relationships", "organise"],
  ["reminders", "organise"],
  ["vocabulary", "organise"],
  ["sync", "automate"],
  ["auto", "automate"],
  ["folders", "setup"],
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
