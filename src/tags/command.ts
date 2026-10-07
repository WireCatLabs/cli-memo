import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { normalizeTag } from "@leemour/cli-messaging"
import { type MessageStore, openStore, type StoredTag } from "@leemour/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { positive } from "../options.js"
import { type SourceScope, type SourceTarget, type SourceTargetInput, sourceTarget } from "../store/source-target.js"

type SourceTagType = "chat" | "message"
type SourceTag = StoredTag & { provider: string; account: string }
interface ListOptions extends SourceScope {
  tag?: string
  type?: SourceTagType
  limit: number
  json?: boolean
}

const typeOf = (value: string): SourceTagType => {
  if (value !== "chat" && value !== "message") throw new InvalidArgumentError("choose chat or message")
  return value
}

const reference = (key: SourceScope, chat: string) =>
  `${key.provider}/${JSON.stringify(key.account)}/${JSON.stringify(chat)}`

const targetOptions = (command: Command) =>
  command
    .argument("<tag...>", "one or more tags: 1–32 letters a–z, digits or hyphens; case is ignored")
    .option("--message <locator>", "a stored note, email or message's full msg: locator")
    .option("--chat <id>", "a stored folder or thread's exact chat id; requires --provider and --account")
    .option("--provider <provider>", "the chat's provider, such as notes or email")
    .option("--account <account>", "the chat's account: an imported notes folder or mailbox address")
    .option("--json", "print JSON")

const listTags = async (store: MessageStore, options: ListOptions) => {
  if (options.account !== undefined && options.provider === undefined)
    throw new CliError("validation_error", "--account requires --provider")
  const keys = (await store.accounts()).filter(
    (key) =>
      (options.provider === undefined || key.provider === options.provider) &&
      (options.account === undefined || key.account === options.account),
  )
  if (keys.length === 0 && (options.provider !== undefined || options.account !== undefined))
    throw new CliError("not_found", "the store holds no matching account")
  const items: SourceTag[] = []
  for (const key of keys) {
    for (const type of options.type === undefined ? (["chat", "message"] as const) : [options.type]) {
      const found = await store.tags(key, { type, ...(options.tag === undefined ? {} : { tag: options.tag }) })
      for (const row of found) {
        if (
          row.type === "message" &&
          (await store.message(key, row.messageId as string, { chatId: row.chatId as string })) === undefined
        )
          continue
        items.push({ ...key, ...row })
        if (items.length > options.limit) return { items: items.slice(0, options.limit), hasMore: true }
      }
    }
  }
  return { items, hasMore: false }
}

export const tagsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const tags = program.command("tags").description("Your labels on stored sources and folders or threads")
  const print = (json: boolean | undefined, value: unknown, text: string) => {
    if (json) createRenderer({ format: "json", color: false, streams }).result(value)
    else streams.data(`${text}\n`)
  }
  const mutate = async (
    operation: "add" | "remove",
    given: string[],
    options: SourceTargetInput & { json?: boolean },
  ) => {
    const selected: SourceTarget = sourceTarget(options)
    const labels = [...new Set(given.map(normalizeTag))]
    const store = await openStore({ env })
    try {
      const changed = await (operation === "add" ? store.addTags : store.removeTags)(
        selected.key,
        selected.target,
        labels,
      )
      const target = { ...selected.target, ...(selected.locator === undefined ? {} : { locator: selected.locator }) }
      const answer = {
        ...selected.key,
        target,
        [operation === "add" ? "added" : "removed"]: changed,
        unchanged: labels.filter((tag) => !changed.includes(tag)),
      }
      const name = selected.locator ?? reference(selected.key, selected.target.chatId)
      print(
        options.json,
        answer,
        `${name}: ${changed.length ? `${operation}: ${changed.join(", ")}` : "no tags changed"}`,
      )
    } finally {
      await store.close()
    }
  }
  for (const operation of ["add", "remove"] as const)
    targetOptions(
      tags
        .command(operation)
        .description(operation === "add" ? "Put labels on one source" : "Remove labels from one source"),
    ).action((given: string[], options: SourceTargetInput & { json?: boolean }) => mutate(operation, given, options))

  tags
    .command("list")
    .description("List source labels, optionally in one provider or account")
    .option("--provider <provider>", "only this provider")
    .option("--account <account>", "only this account; requires --provider")
    .option("--tag <tag>", "only this tag", normalizeTag)
    .option("--type <type>", "chat (folder/thread) or message (note/email/message)", typeOf)
    .option("--limit <n>", "most labels to show", positive, 100)
    .option("--json", "print JSON")
    .action(async (options: ListOptions) => {
      const store = await openStore({ env })
      try {
        const answer = await listTags(store, options)
        const lines = answer.items.map(
          (row) => `${row.tag}  ${row.type}  ${row.locator ?? reference(row, row.chatId as string)}`,
        )
        if (answer.hasMore) lines.push("More labels match; raise --limit to see them.")
        print(options.json, answer, lines.join("\n") || "No source tags.")
      } finally {
        await store.close()
      }
    })
}
