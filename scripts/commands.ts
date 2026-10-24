import { resolve } from "node:path"
import { writeArtifacts } from "@wirecat/cli-base/codegen"
import { COMMANDS_PAGE_LABELS, commandsPage, describeOptions, describeProgram } from "@wirecat/cli-base/commands"
import { commandHelpMarkdown, environmentOf, provide } from "@wirecat/cli-core/cli"
import { COMMAND_MOVES } from "../dist/command-moves.js"
import { createProgram } from "../dist/program.js"

const root = resolve(import.meta.dirname, "..")
const program = createProgram({ env: {} })
provide(program, { ...environmentOf(program), discoveryAvailability: () => ({ available: true }) })
const content = commandsPage({
  cli: "memo",
  commands: describeProgram(program),
  options: describeOptions(program),
  labels: COMMANDS_PAGE_LABELS.en,
  details: (command) => {
    const key = command.path.join(".")
    const anchors = Object.entries(COMMAND_MOVES).flatMap(([before, after]) => {
      const suffix = before === "auto" && key.startsWith(`${after}.`) ? key.slice(after.length) : ""
      return key === after || suffix ? [`<a id="memo-${(before + suffix).replaceAll(".", "-")}"></a>`] : []
    })
    return [...anchors, ...commandHelpMarkdown(program, command.path)]
  },
  text: {
    banner: "<!-- Generated from the command tree by pnpm generate. Do not edit. -->",
    title: "All commands",
    intro:
      "Look up every Memo command and option here. A command that reads names its accounts with `--source`: one as `telegram:1` or `email:work`, every account of a provider, a kind, or `group:<name>`. A command that writes names the one account it acts as with `--account telegram:1`. Memo never chooses an account for you. Add `--json` for an answer a script or agent can read. See [recipes](recipes.md) for whole tasks and [using Memo](usage.md) for a normal day.",
    globalHeading: "Global options",
    globalIntro: "These options work with the `memo` command itself.",
    mutates: "This command can send data to the configured AI provider.",
    mutatesLocal: "This command changes the local store or your files.",
    exitHeading: "Exit codes",
    exitIntro: "Failures use the shared WireCat error contract.",
    outro: "",
  },
})
const stale = writeArtifacts([{ path: "docs/commands.md", content: content.replace(/\n{3,}/g, "\n\n") }], {
  root,
  check: process.argv.includes("--check"),
})
if (process.argv.includes("--check") && stale.length) {
  process.stderr.write("Command reference is stale; run pnpm generate\n")
  process.exitCode = 1
}
