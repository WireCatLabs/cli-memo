import { CliError, type Streams } from "@wirecat/cli-base"
import {
  type Messenger,
  overrideSharedContract,
  provide,
  settingsFor,
  tasksCommand,
  tasksStatsCommand,
} from "@wirecat/cli-core/cli"
import { type AccountKey, openStore } from "@wirecat/cli-core/store"
import { Command } from "commander"
import { APP, STORE_CLIENT } from "../app.js"
import {
  oneAccountOf,
  type SourceOptions,
  sourceOf,
  sourceOptions,
  type WriteOptions,
  writeAccountOf,
  writeOptions,
} from "../store/source-list.js"

const SHARED = ["agenda", "update", "show", "link", "claim", "release"] as const
/** These change a task and name the account they act as with `--account`; the rest read with `--source`. */
const WRITES: ReadonlySet<string> = new Set(["update", "link", "claim", "release"])
/** `task:15`, a bare id or a project key: a `tasks link` target that needs no messenger account. */
const TASKISH = /^(task:.+|\d+|[A-Z][A-Z0-9]*-\d+)$/

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
 * `tasks link` between two project tasks, and `tasks show`, `update`, `claim` or `release` of one, need none: project
 * tasks belong to no messenger account.
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
    const store = await openStore({ env, ...STORE_CLIENT })
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
      if (
        ["show", "update", "claim", "release"].includes(command.name()) &&
        first !== undefined &&
        (await store.tasks.projectTask(first))
      )
        return
      const listed = (await store.accounts.accounts())
        .map((key) => `${option} ${key.provider}:${key.account}`)
        .join("; ")
      throw new CliError("validation_error", `give ${option} — the stored accounts: ${listed || "none yet"}`)
    } finally {
      await store.close()
    }
  }

const scoped = (command: Command, env: NodeJS.ProcessEnv, warn: (text: string) => void): Command =>
  overrideSharedContract(
    command,
    "Memo names stored accounts with --source or --account and uses command-local JSON without messenger profiles.",
    (one) => {
      ;(WRITES.has(one.name())
        ? writeOptions(one, "the account it acts as: telegram:<account>, email:<account>, notes:<id>")
        : sourceOptions(one, "the account: telegram:<account>, email:<account>, notes:<id>, or group:<name> of one")
      )
        .option("--json", "print JSON")
        .hook("preAction", requireAccount(env, warn))
    },
  )

/**
 * `tasks agenda|update|show|link|claim|release` and `stats tasks show` are cli-core's builders, the ones tg and max
 * have, mounted with memo's own `--source`, or `--account` for the writes, resolved to one account
 * (`Messenger.accountOf`).
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
