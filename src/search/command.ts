import { CliError, isCliError, type Streams } from "@wirecat/cli-base"
import { parseLucene, type QueryNode } from "@wirecat/cli-base/query"
import { parseLocator } from "@wirecat/cli-core"
import {
  type SearchAllFound,
  type SearchedResource,
  type SearchFound,
  searchAll,
  searchNotes,
  searchNotesQuery,
  searchStore,
} from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore, Note } from "@wirecat/cli-core/store"
import { openStore } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { APP } from "../app.js"
import { keyDocuments, keyFirst, projectOf } from "../knowledge/key-documents.js"
import { searchMemoriesCommand } from "../memories/command.js"
import { folderIds } from "../notes/bound.js"
import { searchText } from "../notes/search.js"
import { collect, positive } from "../options.js"
import { printAtDetail } from "../output.js"
import { SAVE_HELP } from "../save-help.js"
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

const CHATS_CHECKED = 500

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
    locator: note.ref,
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
      if (!isCliError(error) || error.code !== "validation_error" || !options.keys.length) throw error
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
    if (key.provider === "email")
      coverage.push({ ...key, mail: (await store.syncState(key, "mail_coverage"))?.value ?? null })
    else {
      // Counts, not one row per chat: an account of hundreds of chats made the rows most of an answer.
      const chats = await store.chats(key, { limit: CHATS_CHECKED })
      const archives = await store.chatCompleteness(
        key,
        chats.items.map((chat) => chat.id),
      )
      const count = (test: (chat: (typeof archives)[number]) => boolean) => archives.filter(test).length
      coverage.push({
        ...key,
        chats: {
          checked: archives.length,
          more: chats.hasMore,
          complete: count(({ state }) => state === "complete"),
          partial: count(({ state }) => state === "partial"),
          neverFetched: count(({ state }) => state === "unknown"),
          behind: count(({ upToDate }) => upToDate === false),
          withGaps: count(({ gaps }) => gaps),
        },
      })
    }
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
    : node.clauses.some(({ occur, node }) => occur !== "must_not" && hasSource(node))

export type Level = "brief" | "full"

const levelOf = ({ brief, full }: { brief?: boolean; full?: boolean }): Level | undefined => {
  if (brief && full) throw new CliError("validation_error", "--brief and --full ask for opposite things — pick one")
  return brief ? "brief" : full ? "full" : undefined
}

const line = (text: string) => text.replace(/\s+/g, " ").trim()

/**
 * A found message or email for a reader: its reference first, then when and from whom, who else it went to and
 * where it is filed, its subject or chat, and an excerpt — the whole text only with --full.
 */
export const found = (item: SearchFound["items"][number], level: Level | undefined): string => {
  const mail = item.email
  const names = (people: { name: string | null; address: string }[]) =>
    people.map(({ name, address }) => line(name ?? address)).join(", ")
  const between = mail
    ? [
        mail.to.length ? `to ${names(mail.to)}` : "",
        mail.cc.length ? `cc ${names(mail.cc)}` : "",
        mail.labels.join(", "),
      ]
        .filter(Boolean)
        .join(" · ")
    : ""
  const who = line(item.senderName ?? item.senderId ?? "unknown")
  const lines = [
    item.locator,
    `  ${item.timestamp}  ${who}${level === "brief" || !between ? "" : `  ${between}`}`,
    ...(level === "brief" || !item.chatTitle ? [] : [`  ${line(item.chatTitle)}`]),
    `  ${level === "full" ? item.text.replace(/\n/g, "\n  ") : line(item.excerpt ?? item.text)}`,
  ]
  return lines.join("\n")
}

export interface QueryInput {
  text: string
  limit: number
  exact?: boolean
  timezone?: string
}

/**
 * The account memo's searches run as: its own notes, never a stored account picked for the owner. The scope comes
 * from the query alone, and every account it covers is named in the answer.
 */
const MEMO: AccountKey = { provider: "notes", account: "internal" }

export interface SearchedAccount {
  resource: SearchedResource
  provider: string
  account: string
}

interface EverywhereExtras {
  accounts: SearchedAccount[]
  tasks: Awaited<ReturnType<typeof taskPage>>["items"]
  tasksIncomplete: boolean
}

/** Messages, mail and notes ranked together, with the open tasks that point at a hit and every account read. */
export const searchEverywhere = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  { text, limit, only, exact, timezone }: QueryInput & { only?: SearchedResource[] },
): Promise<SearchAllFound & EverywhereExtras> => {
  const accounts = await store.accounts()
  // The shared search names this command only in the model hint, and the model comes from tg.
  const messenger = { app: { ...APP, command: "tg" } }
  let messageAccounts: AccountKey[] = []
  const found = await searchAll(
    store,
    MEMO,
    {
      text,
      limit,
      env,
      ...(only === undefined ? {} : { only }),
      ...(exact ? { exact: true } : {}),
      ...(timezone === undefined ? {} : { timezone }),
    },
    messenger,
    async (query) => {
      const read = await searchStore(store, MEMO, query, messenger)
      messageAccounts = read.coverage?.accounts ?? []
      return read
    },
  )
  const searched: SearchedAccount[] = []
  for (const resource of found.searched) {
    if (resource === "messages")
      searched.push(...messageAccounts.map(({ provider, account }) => ({ resource, provider, account })))
    if (resource === "mail")
      searched.push(
        ...accounts
          .filter(({ provider }) => provider === "email")
          .map(({ provider, account }) => ({ resource, provider, account })),
      )
    if (resource === "notes")
      searched.push(
        { resource, provider: "notes", account: "internal" },
        ...(await store.notes.folders()).map(({ id }) => ({ resource, provider: "notes", account: id })),
      )
  }
  const tasks = []
  let tasksIncomplete = false
  const sources = found.items.map((item) => item.ref)
  for (const account of accounts) {
    const page = await taskPage(store, account, { state: "open", sources, limit: Math.min(limit, 500) })
    tasks.push(...page.items)
    tasksIncomplete ||= page.hasMore
  }
  return {
    ...found,
    accounts: searched,
    tasks: tasks.slice(0, limit),
    tasksIncomplete: tasksIncomplete || tasks.length > limit,
  }
}

/** One kind with all its fields: messenger messages from every messenger, or imported mail. */
export const searchKind = async (
  store: MessageStore,
  kind: "messages" | "mail",
  { text, limit, type, account, exact, timezone }: QueryInput & { type?: "text" | "voice" | "file"; account?: string },
) => {
  const held = (await store.accounts()).some(
    ({ provider }) => provider !== "notes" && (kind === "mail" ? provider === "email" : provider !== "email"),
  )
  if (!held)
    throw new CliError(
      "not_found",
      kind === "mail" ? "no imported mail; run memo sync --mail" : "no stored messenger messages",
    )
  return searchStore(
    store,
    MEMO,
    {
      text:
        type === undefined
          ? text
          : `(${text}) AND ${{ text: "NOT has:attachment", voice: "has:voice", file: "has:file" }[type]}`,
      language: "lucene",
      kind,
      ...(kind === "messages" && !hasSource(parseLucene(text).root) ? { source: "all" as const } : {}),
      limit,
      ...(account === undefined ? {} : { mailAccount: account }),
      ...(exact ? { exact: true } : {}),
      ...(timezone === undefined ? {} : { timezone }),
    },
    { app: APP },
  )
}

const PROJECT_HELP =
  "rank the key documents of this project (id, key or project:<id>) first, labelled key; nothing is left out"

const keyRefs = async (store: MessageStore, project: string) =>
  new Set((await keyDocuments(store, await projectOf(store, project))).map((item) => item.ref))

export const searchCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program
    .command("search")
    .description("search stored messages, mail, notes and memories; search all when unsure where")
  const withStore = async <T>(work: (store: MessageStore) => Promise<T>) => {
    const store = await openStore({ env })
    try {
      return await work(store)
    } finally {
      await store.close()
    }
  }
  const print = (json: boolean | undefined, answer: unknown, text: string, level?: Level) => {
    if (json) printAtDetail(streams, answer, level)
    else streams.data(`${text}\n`)
  }
  const queryOptions = (leaf: Command) =>
    leaf
      .addHelpText("after", SAVE_HELP)
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
      .option("--json", "print JSON; --json=id,title keeps only those fields")
      .option("--brief", "each message or email as reference, time, sender and excerpt only")
      .option("--full", "each message or email with its whole text and every field")

  queryOptions(
    group
      .command("all")
      .description(
        "messages, mail and notes ranked together; not people, memories, projects or decisions. A kind you know " +
          "reads better with its own search, with all its fields",
      )
      .summary("messages, mail and notes ranked together"),
  )
    .option("--only <resources>", "messages,mail,notes, separated by commas", onlyOf)
    .option("--project <project>", PROJECT_HELP)
    .addHelpText(
      "after",
      `
content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names — memo search all 'content:invoice'.
--json: the list is items; each result's reference is ref, its kind is kind (tg search uses locator).`,
    )
    .action(
      async (
        words: string[],
        options: {
          limit: number
          only?: SearchedResource[]
          exact?: boolean
          timezone?: string
          project?: string
          json?: boolean
        },
      ) => {
        const answer = await withStore(async (store) => {
          const found = await searchEverywhere(store, env, {
            text: words.join(" "),
            limit: options.limit,
            ...(options.only === undefined ? {} : { only: options.only }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          })
          return options.project === undefined
            ? found
            : { ...found, items: keyFirst(found.items, await keyRefs(store, options.project)) }
        })
        if (!options.json) {
          streams.diagnostic(
            `searched: ${answer.accounts.map(({ provider, account }) => `${provider}:${account}`).join(", ") || "nothing"}\n`,
          )
          for (const skipped of answer.skipped)
            streams.diagnostic(`${skipped.resource} not searched: ${skipped.reason}\n`)
          if (answer.notes?.meaningSkipped) streams.diagnostic(`Notes by words only: ${answer.notes.meaningSkipped}\n`)
        }
        print(
          options.json,
          answer,
          [
            ...answer.items.map((item) => `${"key" in item ? "key  " : ""}${item.kind}  ${item.ref}\n  ${item.text}`),
            ...answer.tasks.map((task) => `task  task:${task.id}  ${task.kind}  ${task.source}`),
          ].join("\n"),
        )
      },
    )

  for (const kind of ["messages", "mail"] as const) {
    const leaf = queryOptions(
      group.command(kind).description(kind === "mail" ? "imported emails only" : "stored messenger messages only"),
    )
    if (kind === "messages") leaf.option("--type <type>", "text, voice or file", messageType)
    else leaf.option("--account <account>", "only this mail account, by its address (default: every mail account)")
    leaf.addHelpText(
      "after",
      kind === "messages"
        ? `
content: narrows a search to the text of files, transcript: to voice transcripts, filename: to file names — memo search messages
'content:invoice'. Compare it with tg search messages 'content:invoice', a plain word with a plain word.
--json: the list is items; each hit's reference is locator (msg:…), as in tg search messages.`
        : `
content: narrows a search to the text of attachments, filename: to their names — memo search mail 'content:invoice'.
--json: the list is items; each email's reference is locator (msg:email/…).`,
    )
    leaf.action(
      async (
        words: string[],
        options: {
          limit: number
          exact?: boolean
          timezone?: string
          type?: "text" | "voice" | "file"
          account?: string
          json?: boolean
          brief?: boolean
          full?: boolean
        },
      ) => {
        const level = levelOf(options)
        const answer = await withStore((store) =>
          searchKind(store, kind, {
            text: words.join(" "),
            limit: options.limit,
            ...(options.type === undefined ? {} : { type: options.type }),
            ...(options.account === undefined ? {} : { account: options.account }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          }),
        )
        print(options.json, answer, answer.items.map((item) => found(item, level)).join("\n"), level)
      },
    )
  }

  queryOptions(group.command("notes").description("native notes by words and, with the local model, meaning"))
    .addHelpText("after", "\n--json: the list is hits, not items; each note's reference is ref (note: or document:).")
    .option("--type <type>", "file or internal", noteType)
    .option("--tag <tag>", "only notes with this tag")
    .option("--filter <query>", "another query every note must match")
    .option("--folder <folder>", "only this folder, by its id or path; repeat for more", collect)
    .option("--offset <n>", "continue from next_offset", Number, 0)
    .option("--project <project>", PROJECT_HELP)
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
          project?: string
          exact?: boolean
          timezone?: string
          json?: boolean
        },
      ) => {
        const answer = await withStore(async (store) => {
          const found = await searchNotes(store, words.join(" "), {
            limit: options.limit,
            offset: options.offset,
            env,
            command: "tg",
            ...(options.type === undefined ? {} : { source: options.type }),
            ...(options.tag === undefined ? {} : { tag: options.tag }),
            ...(options.filter === undefined ? {} : { filter: options.filter }),
            ...(options.folder === undefined ? {} : { folderIds: await folderIds(store, env, options.folder) }),
            ...(options.exact ? { exact: true } : {}),
            ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
          })
          return options.project === undefined
            ? found
            : { ...found, hits: keyFirst(found.hits, await keyRefs(store, options.project)) }
        })
        if (answer.meaning_skipped && !options.json)
          streams.diagnostic(`Searched by words only: ${answer.meaning_skipped}\n`)
        print(options.json, answer, searchText(answer))
      },
    )
  searchMemoriesCommand(group, streams, env)
}
