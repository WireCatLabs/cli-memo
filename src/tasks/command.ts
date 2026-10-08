import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { parseLocator } from "@leemour/cli-messaging"
import { closedStateOf, storeOnlyDeps, taskStateOf, tasksService, taskTypeOf } from "@leemour/cli-messaging/services"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { APP } from "../app.js"
import { accountOptions, positive } from "../options.js"
import { type AccountScope, selectAccount } from "../store/scope.js"
import { taskPage } from "./context.js"

export const tasksCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program.command("tasks").description("Open work linked to stored messages, documents and emails")
  const print = (json: boolean | undefined, answer: unknown) =>
    json
      ? createRenderer({ format: "json", color: false, streams }).result(answer)
      : streams.data(`${JSON.stringify(answer, null, 2)}\n`)
  group
    .command("add")
    .argument("<source>", "msg: source locator")
    .option("--type <type>", "question, request, mention or promise", taskTypeOf, "request")
    .option("--json", "print JSON")
    .action(async (source: string, options: { type: ReturnType<typeof taskTypeOf>; json?: boolean }) => {
      const parsed = parseLocator(source),
        key = { provider: parsed.provider, account: parsed.account }
      const store = await openStore({ env })
      try {
        if ((await store.message(key, parsed.message, { chatId: parsed.chat })) === undefined)
          throw new CliError("not_found", "the task source is unavailable or deleted")
        print(
          options.json,
          await tasksService(storeOnlyDeps(store, key, { app: APP, env })).add(source, options.type, "owner"),
        )
      } finally {
        await store.close()
      }
    })
  accountOptions(group.command("list"))
    .option("--state <state>", "open, done or dismissed", taskStateOf, "open")
    .option("--limit <n>", "most tasks", positive, 100)
    .action(
      async (options: AccountScope & { state: ReturnType<typeof taskStateOf>; limit: number; json?: boolean }) => {
        const store = await openStore({ env })
        try {
          const key = await selectAccount(store, options)
          print(
            options.json,
            await taskPage(store, key, {
              state: options.state,
              limit: options.limit,
            }),
          )
        } finally {
          await store.close()
        }
      },
    )
  accountOptions(group.command("close").argument("<id>"))
    .option("--as <state>", "done or dismissed", closedStateOf, "done")
    .option("--reason <text>", "why it is closed")
    .action(
      async (
        id: string,
        options: AccountScope & { as: ReturnType<typeof closedStateOf>; reason?: string; json?: boolean },
      ) => {
        const store = await openStore({ env })
        try {
          const key = await selectAccount(store, options)
          print(
            options.json,
            await tasksService(storeOnlyDeps(store, key, { app: APP, env })).close(id, {
              as: options.as,
              by: "owner",
              ...(options.reason === undefined ? {} : { reason: options.reason }),
            }),
          )
        } finally {
          await store.close()
        }
      },
    )
  accountOptions(group.command("assign").argument("<id>").argument("<person>", "explicit canonical person UID")).action(
    async (id: string, person: string, options: AccountScope & { json?: boolean }) => {
      const store = await openStore({ env })
      try {
        const key = await selectAccount(store, options)
        print(
          options.json,
          await store.knowledge.relate(key, { from: `task:${id}`, to: `person:${person}`, kind: "assigned-to" }),
        )
      } finally {
        await store.close()
      }
    },
  )
}
