import type { KeyringStore, Streams } from "@wirecat/cli-base"
import { modelCatalogueCommand } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers } from "../answer.js"
import { APP } from "../app.js"

export const modelsCommand = (
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  keyring?: KeyringStore,
  stdin?: NodeJS.ReadableStream,
): void => {
  const { print } = answers(program, streams, env)
  program.addCommand(
    modelCatalogueCommand(APP, {
      kinds: ["text"],
      // memo's sync is the one that enriches, so memo offers the switch.
      enrichment: true,
      jsonOption: true,
      env: () => env,
      ...(keyring ? { keyring } : {}),
      ...(stdin ? { stdin: () => stdin } : {}),
      output: (body, command) => print(command.optsWithGlobals<{ json?: boolean }>().json, body),
      diagnostic: (line) => streams.diagnostic(line),
      offline: () => program.opts().offline === true,
    }),
  )
}
