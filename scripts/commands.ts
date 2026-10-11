import { resolve } from "node:path"
import { writeArtifacts } from "@wirecat/cli-base/codegen"
import { COMMANDS_PAGE_LABELS, commandsPage, describeOptions, describeProgram } from "@wirecat/cli-base/commands"
import { createProgram } from "../dist/program.js"

const root = resolve(import.meta.dirname, "..")
const program = createProgram({ env: {} })
const content = commandsPage({
  cli: "memo",
  commands: describeProgram(program),
  options: describeOptions(program),
  labels: COMMANDS_PAGE_LABELS.en,
  text: {
    banner: "<!-- Generated from the command tree by pnpm generate. Do not edit. -->",
    title: "All commands",
    intro:
      "Look up every Memo command and option here. Commands that work in one messenger or mail account take `--provider` and `--account`; Memo never chooses an account for you. Add `--json` for an answer a script or agent can read. See [recipes](recipes.md) for whole tasks and [using Memo](usage.md) for a normal day.",
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
