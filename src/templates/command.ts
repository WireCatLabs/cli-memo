import type { Streams } from "@wirecat/cli-base"
import { overrideSharedContract, templatesCommand as sharedTemplatesCommand } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers } from "../answer.js"
import { APP } from "../app.js"

/** cli-core's `templates`: the owner's own digest templates in the shared store; `edit` and `reset` are his alone. */
export const templatesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const templates = sharedTemplatesCommand(APP, {
    env: () => env,
    output: (body, command) => print(command.optsWithGlobals<{ json?: boolean }>().json, body),
    diagnostic: (line) => streams.diagnostic(line),
  })
  for (const one of templates.commands)
    overrideSharedContract(
      one,
      "Memo's output flag is command-local because this provider does not use the messenger program shell.",
      (command) => {
        command.option("--json", "print JSON")
      },
    )
  program.addCommand(templates)
}
