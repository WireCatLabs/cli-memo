import { CliError, type Streams } from "@wirecat/cli-base"
import { type Messenger, provide, settingsFor, tasksCommand, tasksStatsCommand } from "@wirecat/cli-core/cli"
import { type AccountKey, openStore } from "@wirecat/cli-core/store"
import { Command } from "commander"
import { APP } from "../app.js"
import {
  oneAccountOf,
  type SourceOptions,
  sourceOf,
  sourceOptions,
  type WriteOptions,
  writeAccountOf,
  writeOptions,
} from "../store/source-list.js"

const SHARED = ["agenda", "plan", "show", "link"] as const
/** These change a task and name the account they act as with `--account`; the rest read with `--source`. */
const WRITES: ReadonlySet<string> = new Set(["plan", "link"])
/** `task:15`, a bare id or a project key: a `tasks link` target that needs no messenger account. */
const TASKISH = /^(task:.+|\d+|[A-Z][A-Z0-9]*-\d+)$/

/** memo's own sources in the store: every other provider is a messenger a source tool syncs. */
const NOT_MESSENGERS: ReadonlySet<string> = new Set(["email", "notes"])

// memo's config file is not a messenger profile's, and cli-core's schema refuses its keys: the builders get
// the defaults, from a config folder of a name nothing writes.
const settings = settingsFor({ ...APP, appName: "cli-memo-tasks", envPrefix: "MEMO_TASKS" })

/** The account the preAction hook resolved from `--source`; cli-core asks for it synchronously. */
const resolved = new WeakMap<Command, AccountKey>()

const messenger: Messenger = {
  app: APP,
  provider: "memo",
  chatArgument: "a stored chat, by its id or title",
  resolveSettings: (flags, options) => settings.resolveSettings(flags, { ...options, needsProfile: false }),
  connect: async () => {
    throw new CliError("validation_error", "memo reads no messenger: these commands answer from the store")
  },
  accountOf: (command) => resolved.get(command),
}

/**
 * Never one picked for the owner: a command that names no account fails, listing the ones the store holds.
 * `tasks link` between two project tasks and `tasks show` of one need none: project tasks belong to no messenger
 * account.
 */
const requireAccount =
  (env: NodeJS.ProcessEnv, warn: (text: string) => void) => async (_: Command, command: Command) => {
    const writes = WRITES.has(command.name())
    const option = writes ? "--account" : "--source"
    const value = writes
      ? writeAccountOf(command.opts<WriteOptions>(), warn)
      : sourceOf(command.opts<SourceOptions>(), warn)
    const [first, ...targets] = command.args
    const chats = command.opts<{ chat?: string[] }>().chat ?? []
    const store = await openStore({ env })
    try {
      if (value !== undefined) {
        resolved.set(command, await oneAccountOf(store, env, value, option))
        return
      }
      if (
        command.name() === "link" &&
        targets.length > 0 &&
        chats.length === 0 &&
        targets.every((one) => TASKISH.test(one))
      )
        return
      if (command.name() === "show" && first !== undefined && (await store.tasks.projectTask(first))) return
      const listed = (await store.accounts.accounts())
        .filter((key) => !NOT_MESSENGERS.has(key.provider))
        .map((key) => `${option} ${key.provider}:${key.account}`)
        .join("; ")
      throw new CliError("validation_error", `give ${option} — the stored messenger accounts: ${listed || "none yet"}`)
    } finally {
      await store.close()
    }
  }

const scoped = (command: Command, env: NodeJS.ProcessEnv, warn: (text: string) => void): Command =>
  (WRITES.has(command.name())
    ? writeOptions(command, "the messenger account it acts as: telegram:<account> or max:<account>")
    : sourceOptions(command, "the messenger account: telegram:<account>, max:<account>, or group:<name> of one")
  )
    .option("--json", "print JSON")
    .hook("preAction", requireAccount(env, warn))

/**
 * `tasks agenda|plan|show|link` and `stats tasks show` are cli-core's builders, the ones tg and max have, mounted
 * with memo's own `--source`, or `--account` for plan and link, resolved to one account (`Messenger.accountOf`).
 */
export const sharedTaskCommands = (program: Command, tasks: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  provide(program, { streams, env })
  const warn = (text: string) => streams.diagnostic(text)
  const built = tasksCommand(messenger)
  for (const name of SHARED) {
    const command = built.commands.find((one) => one.name() === name)
    if (!command) throw new Error(`cli-core's tasks builder has no ${name}`)
    tasks.addCommand(scoped(command, env, warn))
  }
  program
    .command("stats")
    .description("statistics about what the store holds")
    .addCommand(
      new Command("tasks").description("task statistics").addCommand(scoped(tasksStatsCommand(messenger), env, warn)),
    )
}
