import { CliError, type Streams } from "@wirecat/cli-base"
import { type Messenger, provide, settingsFor, tasksCommand, tasksStatsCommand } from "@wirecat/cli-core/cli"
import { type AccountKey, openStore } from "@wirecat/cli-core/store"
import { Command } from "commander"
import { APP } from "../app.js"

const SHARED = ["agenda", "plan", "show"] as const

/** memo's own sources in the store: every other provider is a messenger a source tool syncs. */
const NOT_MESSENGERS: ReadonlySet<string> = new Set(["email", "notes"])

// memo's config file is not a messenger profile's, and cli-core's schema refuses its keys: the builders get
// the defaults, from a config folder of a name nothing writes.
const settings = settingsFor({ ...APP, appName: "cli-memo-tasks", envPrefix: "MEMO_TASKS" })

const flagged = (command: Command): Partial<AccountKey> => command.opts<{ provider?: string; account?: string }>()

const messenger: Messenger = {
  app: APP,
  provider: "memo",
  chatArgument: "a stored chat, by its id or title",
  resolveSettings: (flags, options) => settings.resolveSettings(flags, { ...options, needsProfile: false }),
  connect: async () => {
    throw new CliError("validation_error", "memo reads no messenger: these commands answer from the store")
  },
  accountOf: (command) => {
    const { provider, account } = flagged(command)
    return provider && account ? { provider, account } : undefined
  },
}

/** Never one picked for the owner: a command that names no account fails, listing the ones the store holds. */
const requireAccount = (env: NodeJS.ProcessEnv) => async (_: Command, command: Command) => {
  const { provider, account } = flagged(command)
  if (provider && account) return
  const store = await openStore({ env })
  try {
    const listed = (await store.accounts())
      .filter((key) => !NOT_MESSENGERS.has(key.provider))
      .map((key) => `--provider ${key.provider} --account ${key.account}`)
      .join("; ")
    throw new CliError(
      "validation_error",
      `give --provider and --account — the stored messenger accounts: ${listed || "none yet"}`,
    )
  } finally {
    await store.close()
  }
}

const scoped = (command: Command, env: NodeJS.ProcessEnv): Command =>
  command
    .option("--provider <provider>", "the messenger account's provider: telegram, max")
    .option("--account <account>", "the messenger account, as the store holds it")
    .option("--json", "print JSON")
    .hook("preAction", requireAccount(env))

/**
 * `tasks agenda|plan|show` and `stats tasks show` are cli-core's builders, the ones tg and max have, mounted
 * with memo's own `--provider --account` (`Messenger.accountOf`).
 */
export const sharedTaskCommands = (program: Command, tasks: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  provide(program, { streams, env })
  const built = tasksCommand(messenger)
  for (const name of SHARED) {
    const command = built.commands.find((one) => one.name() === name)
    if (!command) throw new Error(`cli-core's tasks builder has no ${name}`)
    tasks.addCommand(scoped(command, env))
  }
  program
    .command("stats")
    .description("statistics about what the store holds")
    .addCommand(
      new Command("tasks").description("task statistics").addCommand(scoped(tasksStatsCommand(messenger), env)),
    )
}
