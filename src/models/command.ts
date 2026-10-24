import { join } from "node:path"
import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { FETCH } from "@wirecat/cli-core/cli"
import { downloadTextModel } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"

export const modelsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const text = program
    .command("models")
    .description("models that run on this machine")
    .command("text")
    .description("embedding models for searching by meaning")
  annotate(text.command("download"), {
    effects: FETCH,
    output: { entity: "model" },
    examples: ["memo models text download e5-small"],
  })
    .description("download a shared search model, check its hash and load it once")
    .argument("<model>", "a shared text model id, such as e5-small")
    .option("--accept-terms", "acknowledge the model's licence terms after reading them")
    .option("--json", "print the model's download receipt as JSON")
    .action(async (id: string, given: { acceptTerms?: boolean; json?: boolean }) => {
      const { model, directory } = await downloadTextModel(id, {
        env,
        acceptTerms: given.acceptTerms === true,
        progress: (line) => streams.diagnostic(`${line}\n`),
      })
      print(
        given.json,
        itemAnswer({
          id: model.id,
          kind: "text",
          title: model.title,
          languages: model.languages,
          licence: model.licence,
          size_bytes: model.files.reduce((sum, file) => sum + file.bytes, 0),
          downloaded: true,
          path: join(directory, model.id),
        }),
      )
    })
}
