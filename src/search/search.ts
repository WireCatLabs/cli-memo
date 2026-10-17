import { CliError, isCliError } from "@wirecat/cli-base"
import { parseLucene, type QueryNode } from "@wirecat/cli-base/query"
import { parseLocator } from "@wirecat/cli-core"
import {
  type SearchAllFound,
  type SearchedResource,
  searchAll,
  searchNotesOf,
  searchNotesQuery,
  searchStore,
} from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore, Note } from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { loadConfig } from "../config.js"
import { keyDocuments, keyFirst, projectOf } from "../knowledge/key-documents.js"
import { mailAccounts } from "../mail/accounts.js"
import { demotedSenders } from "../mail/sender-scores.js"
import { accountsOf } from "../store/source-list.js"
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

/**
 * The account memo's searches run as: its own notes, never a stored account picked for the owner. The scope comes
 * from the query alone, and every account it covers is named in the answer.
 */
const MEMO: AccountKey = { provider: "notes", account: "internal" }

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
    ? await searchStore(store, MEMO, {
        text: query,
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
      coverage.push({ ...key, mail: (await store.sync.syncState(key, "mail_coverage"))?.value ?? null })
    else {
      // Counts, not one row per chat: an account of hundreds of chats made the rows most of an answer.
      const chats = await store.chats.chats(key, { limit: CHATS_CHECKED })
      const archives = await store.chats.chatCompleteness(
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
/** `--all`, or the accounts a `--source` list names; notes count as one source, whichever folder is named. */
export const searchAccounts = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: { all?: boolean; source?: string },
): Promise<{ keys: AccountKey[]; notes: boolean }> => {
  if (options.all && options.source !== undefined)
    throw new CliError("validation_error", "use --all alone, or name the accounts with --source")
  if (options.all)
    return { keys: (await store.accounts.accounts()).filter(({ provider }) => provider !== "notes"), notes: true }
  if (options.source === undefined)
    throw new CliError("validation_error", "give --all, or name the accounts with --source: telegram:1,email,notes")
  const keys = await accountsOf(store, env, options.source)
  return {
    keys: keys.filter(({ provider }) => provider !== "notes"),
    notes: keys.some(({ provider }) => provider === "notes"),
  }
}

const hasSource = (node: QueryNode): boolean =>
  node.kind === "predicate"
    ? node.field === "in"
    : node.clauses.some(({ occur, node }) => occur !== "must_not" && hasSource(node))

export interface QueryInput {
  text: string
  limit: number
  exact?: boolean
  timezone?: string
  /** Leave mail from senders with signs of fraud where the words put it, instead of after the rest. */
  plainOrder?: boolean
}

/** Mail from senders with signs of fraud after the rest of the page, each part in the order it had. */
export const lowerSuspicious = <T>(items: readonly T[], suspicious: (item: T) => boolean): T[] => [
  ...items.filter((item) => !suspicious(item)),
  ...items.filter(suspicious),
]

export interface SearchedAccount {
  resource: SearchedResource
  provider: string
  account: string
}

interface EverywhereExtras {
  accounts: SearchedAccount[]
  tasks: (Awaited<ReturnType<typeof taskPage>>["items"][number] & { heldBy: AccountKey })[]
  tasksIncomplete: boolean
}

/** Messages, mail and notes ranked together, with the open tasks that point at a hit and every account read. */
export const searchEverywhere = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  { text, limit, only, exact, timezone, plainOrder }: QueryInput & { only?: SearchedResource[] },
): Promise<SearchAllFound & EverywhereExtras> => {
  const accounts = await store.accounts.accounts()
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
  const tasks: EverywhereExtras["tasks"] = []
  let tasksIncomplete = false
  const sources = found.items.map((item) => item.ref)
  for (const account of accounts) {
    const page = await taskPage(store, account, { state: "open", sources, limit: Math.min(limit, 500) })
    tasks.push(...page.items.map((task) => ({ ...task, heldBy: account })))
    tasksIncomplete ||= page.hasMore
  }
  const suspicious = plainOrder ? new Set<string>() : await suspiciousRefs(store, found.items)
  return {
    ...found,
    items: lowerSuspicious(found.items, (item) => suspicious.has(item.ref)),
    accounts: searched,
    tasks: tasks.slice(0, limit),
    tasksIncomplete: tasksIncomplete || tasks.length > limit,
  }
}

/** The mail on a page whose sender's mail search ranks lower; the page's items carry no sender address. */
const suspiciousRefs = async (store: MessageStore, items: readonly { kind: string; ref: string }[]) => {
  const demoted = await demotedSenders(store)
  const refs = new Set<string>()
  if (demoted.size === 0) return refs
  for (const { kind, ref } of items) {
    if (kind !== "mail") continue
    const { provider, account, message } = parseLocator(ref)
    const stored = await store.accounts.storedAccount({ provider, account }).catch(() => null)
    const email = stored === null || message === undefined ? null : await store.mail.email(stored.id, message)
    if (email?.fromAddress && demoted.has(email.fromAddress.toLowerCase())) refs.add(ref)
  }
  return refs
}

/** One kind with all its fields: messenger messages from every messenger, or imported mail. */
export const searchKind = async (
  store: MessageStore,
  kind: "messages" | "mail",
  {
    text,
    limit,
    account,
    accounts,
    exact,
    timezone,
    plainOrder,
  }: QueryInput & {
    account?: string
    accounts?: AccountKey[]
  },
) => {
  const held = (await store.accounts.accounts()).some(
    ({ provider }) => provider !== "notes" && (kind === "mail" ? provider === "email" : provider !== "email"),
  )
  if (!held)
    throw new CliError(
      "not_found",
      kind === "mail" ? "no imported mail; run memo sync --only mail" : "no stored messenger messages",
    )
  const found = await searchStore(
    store,
    MEMO,
    {
      text,
      kind,
      ...(kind === "messages" && !hasSource(parseLucene(text).root) ? { source: "all" as const } : {}),
      limit,
      ...(account === undefined ? {} : { mailAccount: account }),
      ...(accounts === undefined ? {} : { accounts }),
      ...(exact ? { exact: true } : {}),
      ...(timezone === undefined ? {} : { timezone }),
    },
    { app: APP },
  )
  if (kind !== "mail" || plainOrder) return found
  return { ...found, items: lowerSuspicious(found.items, (item) => item.email?.senderScore?.demoted === true) }
}

/** The rules and `memo mail status` take an account's name; search takes it too, or the address. */
export const mailAddressOf = (env: NodeJS.ProcessEnv, account: string): string =>
  account.includes("@")
    ? account
    : (mailAccounts(loadConfig(env).mail?.accounts ?? [], [account])[0]?.address ?? account)

const keyRefs = async (store: MessageStore, project: string) =>
  new Set((await keyDocuments(store, await projectOf(store, project))).map((item) => item.ref))

/** A project's key documents first, labelled key; nothing is left out. */
export const keyDocumentsFirst = async <T extends { ref: string }>(
  store: MessageStore,
  items: T[],
  project: string | undefined,
): Promise<(T & { key?: true })[]> => (project === undefined ? items : keyFirst(items, await keyRefs(store, project)))

export interface NotesQuery {
  limit: number
  page: number
  filter?: string
  source?: string
  project?: string
  exact?: boolean
  timezone?: string
}

export const searchNotes = async (store: MessageStore, env: NodeJS.ProcessEnv, text: string, options: NotesQuery) => {
  const found = await searchNotesOf(store, MEMO, text, {
    limit: options.limit,
    offset: (options.page - 1) * options.limit,
    env,
    app: APP,
    ...(options.filter === undefined ? {} : { filter: options.filter }),
    ...(options.source === undefined ? {} : { accounts: options.source }),
    ...(options.exact ? { exact: true } : {}),
    ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
  })
  return options.project === undefined
    ? found
    : { ...found, hits: await keyDocumentsFirst(store, found.hits, options.project) }
}
