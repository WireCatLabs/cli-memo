import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, settingRows } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "./answer.js"
import { configPath, MEMO_SETTINGS, migrateConfig, rawConfig, unsetConfigKey } from "./config.js"

export const configCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const config = program.command("config").description("memo's settings file")

  annotate(config.command("show"), { effects: LOCAL_READ })
    .description("every setting, its value, its default and whether the file sets it")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((options: { json?: boolean }) => {
      const raw = rawConfig(env)
      const rows = settingRows(raw, MEMO_SETTINGS)
      const values = rows.map((row) => `${JSON.stringify(row.value)}${row.from === "default" ? " (default)" : ""}`)
      const wide = (texts: string[]) => texts.reduce((most, text) => Math.max(most, text.length), 0)
      const [settingWidth, valueWidth] = [wide(rows.map((row) => row.setting)), wide(values)]
      const lines = rows.map(
        (row, at) => `${row.setting.padEnd(settingWidth)}  ${values[at]?.padEnd(valueWidth)}  ${row.description}`,
      )
      print(
        options.json,
        itemAnswer({ path: configPath(env), found: raw !== undefined, settings: rows }),
        [configPath(env), ...lines].join("\n"),
      )
    })

  annotate(config.command("migrate"), { effects: LOCAL_WRITE })
    .description("write each setting the file lacks at its default, keeping yours")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((options: { json?: boolean }) => {
      const added = migrateConfig(env)
      print(
        options.json,
        itemAnswer({ path: configPath(env), added }),
        added.length > 0
          ? `added ${added.join(", ")} to ${configPath(env)}`
          : `${configPath(env)} already has every setting`,
      )
    })

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
