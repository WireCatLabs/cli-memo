import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { formatReference, normalizeTag } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { AccountKey, MessageStore, StoredTag } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { folderIds } from "../notes/bound.js"
import { positive } from "../options.js"
import { heldMessage } from "../store/held.js"
import { selectTarget, type TargetInput } from "../store/scope.js"
import {
  ACCOUNTS_HELP,
  accountName,
  accountsOf,
  ONE_ACCOUNT_HELP,
  oneAccountOf,
  type SourceOptions,
  sourceOf,
  sourceOptions,
} from "../store/source-list.js"
import { type SourceScope, type SourceTarget, type SourceTargetInput, sourceTarget } from "../store/source-target.js"
import { canonicalProject } from "../vocabulary/project.js"

const OWNED = ["note", "document", "person", "organization", "project", "task", "meeting", "folder"] as const
const TYPES = ["chat", "message", "contact", ...OWNED] as const
type SourceTagType = (typeof TYPES)[number]
type SourceTag = StoredTag & { provider: string; account: string }
type Picked = Omit<SourceTargetInput & TargetInput, "provider" | "account"> & {
  note?: string
  folder?: string
  subfolder?: string
  json?: boolean
}
interface ListOptions {
  keys: AccountKey[]
  tag?: string
  type?: SourceTagType
  limit: number
  json?: boolean
}

/** memo's rows carry labels on notes, people and folders too, beyond cli-core's `tagging` entity. */
const TAG_QUERY = {
  entity: "source_tag",
  backend: "native",
  fields: [termField("tag", "kw", "tag:work"), termField("type", "enum", "type:note", { values: TYPES })],
} as const satisfies QueryRegistry

const reference = ({ provider, account }: SourceScope, chat: string) =>
  provider && account ? formatReference({ type: "chat", provider, account, chat }) : chat

const targetOptions = (command: Command) =>
  sourceOptions(
    command
      .argument("<tag...>", "one or more tags: 1–32 letters a–z, digits or hyphens; case is ignored")
      .option("--message <message>", "a stored email or message's full msg: locator")
      .option("--note <reference>", "a note: note:<id>, a file in a notes folder: document:<id>; a bare id is a note")
      .option("--chat <chat>", "a stored mail thread or chat's exact id; requires --source")
      .option("--task <id>", "label a task")
      .option("--contact <person>", "label a contact identity, with --source")
      .option("--person <uid>", "label a unified person")
      .option("--organization <organization>", "label an organization: its id or organization:<id>")
      .option("--project <project>", "label a project: its key or project:<id>")
      .option("--meeting <id>", "label a meeting by its store id, with --source")
      .option(
        "--folder <folder>",
        "label a notes folder by its id or path, or with --subfolder one subfolder: every note under it",
      )
      .option("--subfolder <path>", "the subfolder inside --folder"),
    `the account of --chat, --contact or --meeting: ${ONE_ACCOUNT_HELP}`,
  ).option("--json", "print JSON; --json=id,title keeps only those fields")

const listTags = async (store: MessageStore, options: ListOptions) => {
  const items: SourceTag[] = []
  for (const key of options.keys) {
    const types =
      options.type === undefined
        ? (["chat", "message", "contact"] as const)
        : options.type === "chat" || options.type === "message" || options.type === "contact"
          ? [options.type]
          : []
    for (const type of types) {
      const found = await store.tags.tags(key, { type, ...(options.tag === undefined ? {} : { tag: options.tag }) })
      for (const row of found) {
        if (
          row.type === "contact" &&
          !(await store.knowledge.tags(key, { type: "contact", id: row.personId as string })).includes(row.tag)
        )
          continue
        if (
          row.type === "message" &&
          (await heldMessage(store, key, row.messageId as string, row.chatId as string)) === undefined
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
  const tags = program.command("tags").description("your labels on stored sources and folders or threads")
  const { print } = answers(program, streams, env)
  const warn = (text: string) => streams.diagnostic(text)
  const mutate = async (
    operation: "add" | "remove",
    given: string[],
    { provider, account, source, ...options }: Picked & SourceOptions,
  ) => {
    const value = sourceOf({ provider, account, source }, warn)
    const scoped = async (store: MessageStore) => (value === undefined ? {} : oneAccountOf(store, env, value))
    const target =
      options.note !== undefined
        ? options.note.startsWith("document:")
          ? { type: "document" as const, id: options.note.slice("document:".length) }
          : { type: "note" as const, id: options.note.replace(/^note:/, "") }
        : options.person !== undefined
          ? { type: "person" as const, id: options.person.replace(/^person:/, "") }
          : options.organization !== undefined
            ? { type: "organization" as const, id: options.organization.replace(/^organization:/, "") }
            : options.project !== undefined
              ? { type: "project" as const, id: options.project }
              : options.task !== undefined
                ? { type: "task" as const, id: options.task.replace(/^task:/, "") }
                : options.folder !== undefined
                  ? { type: "folder" as const, id: options.folder, path: options.subfolder ?? null }
                  : undefined
    if (options.subfolder !== undefined && options.folder === undefined)
      throw new CliError("validation_error", "--subfolder names a subfolder of --folder")
    if (target !== undefined) {
      await withStore(env, async (store) => {
        if (target.type === "project") target.id = (await canonicalProject(store, target.id)).slice("project:".length)
        if (target.type === "folder") {
          const [id, ...more] = await folderIds(store, env, [target.id])
          if (id === undefined || more.length > 0)
            throw new CliError("not_found", `no folder of notes ${target.id}`, { reason: "folder.not-found" })
          target.id = id
        }
        const changed = await (operation === "add" ? store.knowledge.addTags : store.knowledge.removeTags)(
          null,
          target,
          given,
        )
        print(
          options.json,
          itemAnswer({ target, [operation === "add" ? "added" : "removed"]: changed }),
          `${operation}: ${changed.join(", ") || "no labels changed"}`,
        )
      })
      return
    }
    if (options.contact !== undefined || options.meeting !== undefined) {
      await withStore(env, async (store) => {
        const { key, target } = await selectTarget(store, { ...options, ...(await scoped(store)) })
        const changed = await (operation === "add" ? store.knowledge.addTags : store.knowledge.removeTags)(
          key,
          target,
          given,
        )
        print(
          options.json,
          itemAnswer({ ...key, target, [operation === "add" ? "added" : "removed"]: changed }),
          `${operation}: ${changed.join(", ") || "no labels changed"}`,
        )
      })
      return
    }
    if (options.message !== undefined && value !== undefined)
      throw new CliError("validation_error", "a message locator names its account and chat — use --message alone")
    const labels = [...new Set(given.map(normalizeTag))]
    await withStore(env, async (store) => {
      const selected: SourceTarget = sourceTarget({ ...options, ...(await scoped(store)) })
      const changed = await (operation === "add" ? store.tags.addTags : store.tags.removeTags)(
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
        itemAnswer(answer),
        `${name}: ${changed.length ? `${operation}: ${changed.join(", ")}` : "no tags changed"}`,
      )
    })
  }
  for (const operation of ["add", "remove"] as const)
    targetOptions(
      annotate(tags.command(operation), { effects: LOCAL_WRITE }).description(
        operation === "add" ? "put labels on one source" : "remove labels from one source",
      ),
    ).action((given: string[], options: Picked & SourceOptions) => mutate(operation, given, options))

  const tagsList = withQuery(
    annotate(tags.command("list"), { effects: LOCAL_READ, output: { entity: "source_tag" } }).description(
      "list source labels, of every account or of the ones --source names",
    ),
    TAG_QUERY,
  )
  sourceOptions(tagsList, `only these accounts (default: every one): ${ACCOUNTS_HELP}`)
    .option("--limit <n>", "most labels to show", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], given: SourceOptions & { limit: number; json?: boolean }) => {
      const terms = queryTerms(words, TAG_QUERY, "tags list")
      const tag = terms.get("tag")
      const value = sourceOf(given, warn)
      const options: Omit<ListOptions, "keys"> = {
        limit: given.limit,
        ...(given.json === undefined ? {} : { json: given.json }),
        ...(tag === undefined ? {} : { tag: normalizeTag(tag) }),
        ...(terms.has("type") ? { type: terms.get("type") as SourceTagType } : {}),
      }
      await withStore(env, async (store) => {
        const keys = value === undefined ? await store.accounts.accounts() : await accountsOf(store, env, value)
        const answer = await listTags(store, { ...options, keys })
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
          (row) =>
            `${row.tag}  ${row.type}  ${
              row.locator ??
              (row.type === "contact" ? `${row.provider}:${row.personId ?? ""}` : reference(row, row.chatId ?? ""))
            }`,
        )
        if (answer.hasMore) lines.push("More labels match; raise --limit to see them.")
        answer.hasMore ||= knowledge.length > options.limit
        print(
          options.json,
          listAnswer("tags list", {
            items: [
              ...answer.items,
              ...knowledge
                .slice(0, options.limit)
                .flatMap(({ target, labels }) => labels.map(({ tag, origin }) => ({ ...target, tag, origin }))),
            ],
            limit: options.limit,
            has_more: answer.hasMore,
            meta: { accounts: keys.map(accountName) },
          }),
          [
            ...lines,
            ...knowledge
              .slice(0, options.limit)
              .map(
                (item) =>
                  `${item.labels.map(({ tag, origin }) => (origin === "file" ? `${tag} (file)` : tag)).join(", ")}  ${item.target.type}  ${
                    item.target.type === "message" ? item.target.locator : `${item.target.type}:${item.target.id}`
                  }`,
              ),
          ].join("\n") || "No source tags.",
        )
      })
    })
}
