import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import { commandsDocument, flatten } from "@wirecat/cli-base/commands"
import type { Command } from "commander"
import { VERSION } from "../version.js"

/** The major version of the JSON memo's commands print; raise it when a field is removed or renamed. */
export const CONTRACT = 3

export const commandsCommand = (program: Command, streams: Streams): void => {
  program
    .command("commands")
    .argument("[path...]", "one command, such as tags add")
    .description("discover the command tree and options as shared registry data")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((path: string[], options: { json?: boolean }) => {
      const document = commandsDocument(program, { cli: "memo", version: VERSION, contract: CONTRACT })
      const answer = path.length ? scoped(document, path) : document
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${JSON.stringify(answer, null, 2)}\n`)
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
