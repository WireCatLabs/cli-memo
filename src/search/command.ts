import { CliError, createRenderer, type Streams } from "@wirecat/cli-core"
import { parseLocator } from "@wirecat/cli-messaging"
import {
  parseLucene,
  type QueryNode,
  type SearchedResource,
  searchAll,
  searchNotes,
  searchNotesQuery,
  searchStore,
} from "@wirecat/cli-messaging/services"
import type { AccountKey, MessageStore, Note } from "@wirecat/cli-messaging/store"
import { openStore } from "@wirecat/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { APP } from "../app.js"
import { boundFolders } from "../notes/bound.js"
import { searchText } from "../notes/search.js"
import { positive } from "../options.js"
import { type AccountScope, selectAccount } from "../store/scope.js"
import { taskPage } from "../tasks/context.js"

export interface EvidenceItem {
  kind: "message" | "note" | "email" | "task"
  locator: string
  provider: string
  account: string
  timestamp: string
  text: string
  match: "structured-words" | "note-text" | "task-source"
  source?: string
}

export const unifiedSearch = async (
  store: MessageStore,
  query: string,
  options: { keys: AccountKey[]; notes?: boolean; limit?: number; offset?: number; noteText?: string },
): Promise<{
  query: string
  items: EvidenceItem[]
  hasMore: boolean
  nextOffset?: number
  incomplete: boolean
  accounts: AccountKey[]
  coverage: unknown[]
}> => {
  const limit = options.limit ?? 20,
    offset = options.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000)
    throw new CliError("validation_error", "limit takes 1–100; offset takes 0–1000")
  if ((!options.keys.length && !options.notes) || options.keys.length > 50)
    throw new CliError("validation_error", "select 1–50 accounts, or notes")
  const answer = options.keys.length
    ? await searchStore(store, options.keys[0] as AccountKey, {
        text: query,
        language: "lucene",
        accounts: options.keys,
        limit: Math.min(2000, offset + limit + 1),
        newest: true,
      })
    : { items: [], hasMore: false }
  const items: EvidenceItem[] = answer.items.map((hit) => {
    const key = parseLocator(hit.locator)
    return {
      kind: key.provider === "email" ? "email" : "message",
      locator: hit.locator,
      provider: key.provider,
      account: key.account,
      timestamp: hit.timestamp,
      text: hit.text.slice(0, 2000),
      match: "structured-words",
    }
  })
  const matched = new Set(items.map((hit) => hit.locator))
  const coverage: unknown[] = []
  let incomplete = answer.hasMore
  const noteItem = (note: Note, match: EvidenceItem["match"]): EvidenceItem => ({
    kind: "note",
    locator: `note:${note.id}`,
    provider: "notes",
    account: note.folderId ?? "internal",
    timestamp: note.updatedAt,
    text: note.text.slice(0, 2000),
    match,
  })
  if (options.notes) {
    try {
      const notes = await searchNotesQuery(store, { text: query, limit: Math.min(500, offset + limit + 1) })
      incomplete ||= notes.hasMore
      items.push(...notes.items.map(({ note }) => noteItem(note, "structured-words")))
      coverage.push({ notes: "searched" })
    } catch (error) {
      // A field only messages have (`from:`, `after:`) is refused by notes; the messages still answer.
      if (!(error instanceof CliError) || error.code !== "validation_error" || !options.keys.length) throw error
      coverage.push({ notes: `not searched: ${error.message}` })
      incomplete = true
    }
  }
  if (options.noteText !== undefined) {
    const notes = await store.notes.notes({
      source: "internal",
      search: options.noteText,
      limit: Math.min(500, offset + limit + 1),
    })
    incomplete ||= notes.hasMore
    items.push(...notes.items.map((note) => noteItem(note, "note-text")))
  }
  for (const item of items) matched.add(item.locator)
  for (const key of options.keys) {
    const taskResults = await taskPage(store, key, {
      state: "open",
      sources: [...matched],
      limit: Math.min(500, offset + limit + 1),
    })
    incomplete ||= taskResults.hasMore
    for (const task of taskResults.items) {
      if (matched.has(task.source))
        items.push({
          kind: "task",
          locator: `task:${task.id}`,
          ...key,
          timestamp: task.createdAt.toISOString(),
          text: task.kind,
          source: task.source,
          match: "task-source",
        })
    }
    coverage.push({
      ...key,
      mail: key.provider === "email" ? ((await store.syncState(key, "mail_coverage"))?.value ?? null) : undefined,
      archives: await store.chatCompleteness(
        key,
        (await store.chats(key, { limit: 500 })).items.map((chat) => chat.id),
      ),
    })
  }
  items.sort(
    (a, b) =>
      b.timestamp.localeCompare(a.timestamp) || a.kind.localeCompare(b.kind) || a.locator.localeCompare(b.locator),
  )
  const unique = [...new Map(items.map((item) => [item.locator, item])).values()]
  const hasMore = unique.length > offset + limit
  return {
    query,
    items: unique.slice(offset, offset + limit),
    hasMore,
    ...(hasMore && offset + limit <= 1000 ? { nextOffset: offset + limit } : {}),
    incomplete: incomplete || (hasMore && offset + limit > 1000),
    accounts: options.keys,
    coverage,
  }
}

/** Notes are no account's: `--all` takes them with every account, `--provider notes` alone. */
export const searchAccounts = async (
  store: MessageStore,
  options: AccountScope & { all?: boolean },
): Promise<{ keys: AccountKey[]; notes: boolean }> => {
  if (options.all && (options.provider !== undefined || options.account !== undefined))
    throw new CliError("validation_error", "use --all alone or select one provider/account")
  if (options.provider === "notes") return { keys: [], notes: true }
  const messengers = (await store.accounts()).filter(({ provider }) => provider !== "notes")
  return options.all ? { keys: messengers, notes: true } : { keys: [await selectAccount(store, options)], notes: false }
}

const onlyOf = (value: string): SearchedResource[] => {
  const selected = value.split(",").map((part) => part.trim())
  if (!selected.length || selected.some((part) => !["messages", "mail", "notes"].includes(part)))
    throw new InvalidArgumentError("choose messages,mail,notes, separated by commas")
  return [...new Set(selected)] as SearchedResource[]
}

const noteType = (value: string): Note["source"] => {
  if (value !== "file" && value !== "internal") throw new InvalidArgumentError("choose file or internal")
  return value
}

const messageType = (value: string): "text" | "voice" | "file" => {
  if (value !== "text" && value !== "voice" && value !== "file")
    throw new InvalidArgumentError("choose text, voice or file")
  return value
}

const hasSource = (node: QueryNode): boolean =>
  node.kind === "predicate"
    ? node.field === "in"
    : node.clauses.some(({ occur, node }) => occur !== "mustNot" && hasSource(node))

const searchFolderIds = async (store: MessageStore, env: NodeJS.ProcessEnv, selected: string[]): Promise<string[]> => {
  const known = new Set((await store.notes.folders()).map(({ id }) => id))
  const paths = selected.filter((value) => !known.has(value))
  const bound = paths.length ? await boundFolders(store, env, { only: paths }) : []
  return [...new Set([...selected.filter((value) => known.has(value)), ...bound.map(({ id }) => id)])]
}

export const searchCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program.command("search").description("Search stored messages, mail and notes; start with search all")
  const withStore = async <T>(work: (store: MessageStore) => Promise<T>) => {
    const store = await openStore({ env })
    try {
      return await work(store)
    } finally {
      await store.close()
    }
  }
  const print = (json: boolean | undefined, answer: unknown, text: string) => {
    if (json) createRenderer({ format: "json", color: false, streams }).result(answer)
    else streams.data(`${text}\n`)
  }
  const queryOptions = (leaf: Command) =>
    leaf
      .argument("<query...>", "words, phrases, Boolean operators and field queries")
      .option(
        "--limit <n>",
        "most results, at most 100",
        (value: string) => {
          const limit = positive(value)
          if (limit > 100) throw new InvalidArgumentError("at most 100")
          return limit
        },
        20,
      )
      .option("--exact", "words as written; skip meaning search")
      .option("--timezone <zone>", "IANA timezone for calendar date boundaries")
      .option("--json", "print JSON")

  queryOptions(
    group.command("all").description("Messages, mail and notes, ranked together by the shared search service"),
  )
    .option("--only <resources>", "messages,mail,notes, separated by commas", onlyOf)
    .action(
      async (
        words: string[],
        options: { limit: number; only?: SearchedResource[]; exact?: boolean; timezone?: string; json?: boolean },
      ) => {
        const answer = await withStore(async (store) => {
          const accounts = await store.accounts()
          const key = accounts.find(({ provider }) => provider !== "notes") ?? {
            provider: "notes",
            account: "internal",
          }
          const found = await searchAll(
            store,
            key,
            {
              text: words.join(" "),
              limit: options.limit,
              env,
              ...(options.only === undefined ? {} : { only: options.only }),
              ...(options.exact ? { exact: true } : {}),
              ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
            },
            { app: APP },
          )
          const tasks = []
          let tasksIncomplete = false
          const sources = found.items.map((item) => item.ref)
          for (const account of accounts) {
            const page = await taskPage(store, account, { state: "open", sources, limit: Math.min(options.limit, 500) })
            tasks.push(...page.items)
            tasksIncomplete ||= page.hasMore
          }
          return {
            ...found,
            tasks: tasks.slice(0, options.limit),
            tasksIncomplete: tasksIncomplete || tasks.length > options.limit,
          }
        })
        if (!options.json) {
          for (const skipped of answer.skipped)
            streams.diagnostic(`${skipped.resource} not searched: ${skipped.reason}\n`)
          if (answer.notes?.meaningSkipped) streams.diagnostic(`Notes by words only: ${answer.notes.meaningSkipped}\n`)
        }
        print(
          options.json,
          answer,
          [
            ...answer.items.map((item) => `${item.kind}  ${item.ref}\n  ${item.text}`),
            ...answer.tasks.map((task) => `task  task:${task.id}  ${task.kind}  ${task.source}`),
          ].join("\n"),
        )
      },
    )

  for (const kind of ["messages", "mail"] as const) {
    const leaf = queryOptions(
      group.command(kind).description(kind === "mail" ? "Imported emails only" : "Stored messenger messages only"),
    )
    if (kind === "messages") leaf.option("--type <type>", "text, voice or file", messageType)
    leaf.action(
      async (
        words: string[],
        options: {
          limit: number
          exact?: boolean
          timezone?: string
          type?: "text" | "voice" | "file"
          json?: boolean
        },
      ) => {
        const answer = await withStore(async (store) => {
          const accounts = (await store.accounts()).filter(
            ({ provider }) => provider !== "notes" && (kind === "mail" ? provider === "email" : provider !== "email"),
          )
          if (!accounts.length)
            throw new CliError(
              "not_found",
              kind === "mail" ? "no imported mail; run memo mail import" : "no stored messenger messages",
            )
          return searchStore(
            store,
            accounts[0] as AccountKey,
            {
              text:
                options.type === undefined
                  ? words.join(" ")
                  : `(${words.join(" ")}) AND ${{ text: "NOT has:attachment", voice: "has:voice", file: "has:file" }[options.type]}`,
              language: "lucene",
              kind,
              ...(kind === "messages" && !hasSource(parseLucene(words.join(" ")).root)
                ? { source: "all" as const }
                : {}),
              limit: options.limit,
              ...(options.exact ? { exact: true } : {}),
              ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
            },
            { app: APP },
          )
        })
        print(options.json, answer, answer.items.map((item) => `${item.locator}\n  ${item.text}`).join("\n"))
      },
    )
  }

  queryOptions(group.command("notes").description("Native notes by words and, with the local model, meaning"))
    .option("--type <type>", "file or internal", noteType)
    .option("--tag <tag>", "only notes with this tag")
    .option("--filter <query>", "another query every note must match")
    .option("--folder <path-or-id...>", "only these folders")
    .option("--offset <n>", "continue from nextOffset", Number, 0)
    .action(
      async (
        words: string[],
        options: {
          limit: number
          offset: number
          type?: Note["source"]
          tag?: string
          filter?: string
          folder?: string[]
          exact?: boolean
          timezone?: string
          json?: boolean
        },
      ) => {
        const answer = await withStore(async (store) =>
          searchNotes(store, words.join(" "), {
            limit: options.limit,
            offset: options.offset,
            env,
            command: "memo",
            ...(options.type === undefined ? {} : { source: options.type }),
            ...(options.tag === undefined ? {} : { tag: options.tag }),
            ...(options.filter === undefined ? {} : { filter: options.filter }),
            ...(options.folder === undefined ? {} : { folderIds: await searchFolderIds(store, env, options.folder) }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          }),
        )
        if (answer.meaningSkipped && !options.json)
          streams.diagnostic(`Searched by words only: ${answer.meaningSkipped}\n`)
        print(options.json, answer, searchText(answer))
      },
    )
}
