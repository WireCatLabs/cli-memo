import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "./answer.js"
import { configPath, unsetConfigKey } from "./config.js"

export const configCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const config = program.command("config").description("memo's settings file")

  annotate(config.command("unset"), { effects: LOCAL_WRITE })
    .description("remove one setting from the config file, even one memo does not know")
    .argument("<key>", "the setting's dotted path, as memo doctor names it, e.g. permissions.notes.edit")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nRuns on a file with problems, so the fix memo doctor prints works; a file that is not valid JSON is edited by hand.",
    )
    .action((key: string, options: { json?: boolean }) => {
      const removed = unsetConfigKey(key, env)
      print(
        options.json,
        itemAnswer({ key, removed, path: configPath(env) }),
        removed ? `removed ${key} from ${configPath(env)}` : `${key} is not in ${configPath(env)}`,
      )
    })
}
