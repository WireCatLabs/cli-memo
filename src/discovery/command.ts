import { CliError, createRenderer, type Streams } from "@wirecat/cli-core"
import { describeOptions, describeProgram, flatten } from "@wirecat/cli-core/commands"
import type { Command } from "commander"

export const commandsCommand = (program: Command, streams: Streams): void => {
  program
    .command("commands")
    .argument("[path...]", "one command, such as tags add")
    .description("Discover the command tree and options as shared registry data")
    .option("--json", "print JSON")
    .action((path: string[], options: { json?: boolean }) => {
      const commands = describeProgram(program)
      const found = path.length ? flatten(commands).filter((item) => item.path.join(" ") === path.join(" ")) : commands
      if (path.length && !found.length) throw new CliError("not_found", "command path was not found")
      const answer = {
        items: found,
        ...(path.length ? {} : { cli: "memo", commands, globalOptions: describeOptions(program) }),
      }
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(answer)
      else streams.data(`${JSON.stringify(answer, null, 2)}\n`)
    })
}
