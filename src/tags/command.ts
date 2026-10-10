import { CliError, createRenderer, type Streams } from "@wirecat/cli-core"
import { normalizeTag } from "@wirecat/cli-messaging"
import { type MessageStore, openStore, type StoredTag } from "@wirecat/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { positive } from "../options.js"
import { selectTarget, type TargetInput } from "../store/scope.js"
import { type SourceScope, type SourceTarget, type SourceTargetInput, sourceTarget } from "../store/source-target.js"

type SourceTagType = "chat" | "message" | "contact" | "note" | "person" | "task" | "entity" | "folder"
const OWNED = ["note", "person", "task", "entity", "folder"] as const
type SourceTag = StoredTag & { provider: string; account: string }
interface ListOptions extends SourceScope {
  tag?: string
  type?: SourceTagType
  limit: number
  json?: boolean
}

const typeOf = (value: string): SourceTagType => {
  if (!["chat", "message", "contact", "note", "person", "task", "entity", "folder"].includes(value))
    throw new InvalidArgumentError("choose chat, message, contact, note, person, task, entity or folder")
  return value as SourceTagType
}

const reference = (key: SourceScope, chat: string) =>
  `${key.provider}/${JSON.stringify(key.account)}/${JSON.stringify(chat)}`

const targetOptions = (command: Command) =>
  command
    .argument("<tag...>", "one or more tags: 1–32 letters a–z, digits or hyphens; case is ignored")
    .option("--message <locator>", "a stored email or message's full msg: locator")
    .option("--note <id>", "a note: note:<id> or its id")
    .option("--chat <id>", "a stored mail thread or chat's exact id; requires --provider and --account")
    .option("--provider <provider>", "the chat's provider, such as email")
    .option("--account <account>", "the chat's account, such as a mailbox address")
    .option("--task <id>", "label a task")
    .option("--contact <id>", "label a contact identity, with provider/account")
    .option("--person <uid>", "label a unified person")
    .option("--entity <id>", "label an organization, family or project")
    .option("--folder <id>", "label a notes folder, or with --path one subfolder: every note under it")
    .option("--path <subfolder>", "the subfolder inside --folder")
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
    const types =
      options.type === undefined
        ? (["chat", "message", "contact"] as const)
        : options.type === "chat" || options.type === "message" || options.type === "contact"
          ? [options.type]
          : []
    for (const type of types) {
      const found = await store.tags(key, { type, ...(options.tag === undefined ? {} : { tag: options.tag }) })
      for (const row of found) {
        if (
          row.type === "contact" &&
          !(await store.knowledge.tags(key, { type: "contact", id: row.personId as string })).includes(row.tag)
        )
          continue
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
    options: SourceTargetInput & TargetInput & { note?: string; folder?: string; path?: string; json?: boolean },
  ) => {
    const target =
      options.note !== undefined
        ? { type: "note" as const, id: options.note.replace(/^note:/, "") }
        : options.person !== undefined
          ? { type: "person" as const, id: options.person.replace(/^person:/, "") }
          : options.entity !== undefined
            ? { type: "entity" as const, id: options.entity.replace(/^entity:/, "") }
            : options.task !== undefined
              ? { type: "task" as const, id: options.task.replace(/^task:/, "") }
              : options.folder !== undefined
                ? { type: "folder" as const, id: options.folder, path: options.path ?? null }
                : undefined
    if (options.path !== undefined && options.folder === undefined)
      throw new CliError("validation_error", "--path names a subfolder of --folder")
    if (target !== undefined) {
      const store = await openStore({ env })
      try {
        const changed = await (operation === "add" ? store.knowledge.addTags : store.knowledge.removeTags)(
          null,
          target,
          given,
        )
        print(
          options.json,
          { target, [operation === "add" ? "added" : "removed"]: changed },
          `${operation}: ${changed.join(", ") || "no labels changed"}`,
        )
      } finally {
        await store.close()
      }
      return
    }
    if (options.contact !== undefined) {
      const store = await openStore({ env })
      try {
        const { key, target } = await selectTarget(store, options)
        const changed = await (operation === "add" ? store.knowledge.addTags : store.knowledge.removeTags)(
          key,
          target,
          given,
        )
        print(
          options.json,
          { ...key, target, [operation === "add" ? "added" : "removed"]: changed },
          `${operation}: ${changed.join(", ") || "no labels changed"}`,
        )
      } finally {
        await store.close()
      }
      return
    }
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
    ).action(
      (
        given: string[],
        options: SourceTargetInput & TargetInput & { note?: string; folder?: string; path?: string; json?: boolean },
      ) => mutate(operation, given, options),
    )

  tags
    .command("list")
    .description("List source labels, optionally in one provider or account")
    .option("--provider <provider>", "only this provider")
    .option("--account <account>", "only this account; requires --provider")
    .option("--tag <tag>", "only this tag", normalizeTag)
    .option("--type <type>", "chat, message, contact, note, person, task, entity or folder", typeOf)
    .option("--limit <n>", "most labels to show", positive, 100)
    .option("--json", "print JSON")
    .action(async (options: ListOptions) => {
      const store = await openStore({ env })
      try {
        const answer = await listTags(store, options)
        const owned =
          options.type === undefined || (OWNED as readonly string[]).includes(options.type)
            ? await store.knowledge.labelled(null, {
                ...(options.tag === undefined ? {} : { tag: options.tag }),
                ...(options.type === undefined ? {} : { type: options.type as (typeof OWNED)[number] }),
                limit: Math.min(options.limit, 500),
              })
            : { items: [], hasMore: false }
        const knowledge = owned.items
        answer.hasMore ||= owned.hasMore
        const lines = answer.items.map(
          (row) => `${row.tag}  ${row.type}  ${row.locator ?? reference(row, row.chatId ?? row.personId ?? "")}`,
        )
        if (answer.hasMore) lines.push("More labels match; raise --limit to see them.")
        answer.hasMore ||= knowledge.length > options.limit
        print(
          options.json,
          { ...answer, knowledge: knowledge.slice(0, options.limit) },
          [
            ...lines,
            ...knowledge
              .slice(0, options.limit)
              .map(
                (item) =>
                  `${item.labels.map(({ tag, origin }) => (origin === "file" ? `${tag} (file)` : tag)).join(", ")}  ${item.target.type}  ${JSON.stringify(item.target)}`,
              ),
          ].join("\n") || "No source tags.",
        )
      } finally {
        await store.close()
      }
    })
}
