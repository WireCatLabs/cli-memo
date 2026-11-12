import { CliError, isCliError } from "@wirecat/cli-base"
import { parseLucene, type QueryNode } from "@wirecat/cli-base/query"
import { type DealKind, parseLocator } from "@wirecat/cli-core"
import { demotedSenders, lowerSuspicious, searchMail } from "@wirecat/cli-core/mail"
import {
  meaningLane,
  plainQuery,
  questionLookup,
  RESOURCES_SEARCHED,
  type SearchAllFound,
  type SearchAllItem,
  type SearchedResource,
  searchAll,
  searchNotesOf,
  searchNotesQuery,
  searchStore,
} from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore, Note } from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { keyDocuments, keyFirst, projectOf } from "../knowledge/key-documents.js"
import { accountsByKind, groupScopeOf, MEMO_ACCOUNT, scopedAccounts } from "../store/group.js"
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

/** memo's searches run as its own notes, never a stored account picked for the owner; the query sets the scope. */
const MEMO = MEMO_ACCOUNT

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
    timestamp: note.modifiedAt ?? note.updatedAt,
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
    return { keys: (await scopedAccounts(store, env)).filter(({ provider }) => provider !== "notes"), notes: true }
  if (options.source === undefined)
    throw new CliError("validation_error", "give --all, or name the accounts with --source: telegram:1,email,notes")
  const keys = await accountsOf(store, env, options.source)
  return {
    keys: keys.filter(({ provider }) => provider !== "notes"),
    notes: keys.some(({ provider }) => provider === "notes"),
  }
}

export const hasSource = (node: QueryNode): boolean =>
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

interface EverywhereExtras {
  tasks: (Awaited<ReturnType<typeof taskPage>>["items"][number] & { heldBy: AccountKey })[]
  tasksIncomplete: boolean
  /** Why `--harder` sent nothing before cli-core was asked. */
  harderSkipped?: string
}

/** Pages read past hits the caller may not see; a page short of `limit` after them says `hasMore`. */
const PAGES_PAST_HIDDEN = 5

/**
 * A page of `limit` hits the caller may see, reading the next pages while hidden hits leave it short, so `--limit`
 * is not spent on what is left out.
 */
const allowedPage = async (
  ask: (offset?: number) => Promise<SearchAllFound>,
  limit: number,
  shows: (item: SearchAllItem) => boolean,
): Promise<SearchAllFound> => {
  const first = await ask()
  let items = first.items.filter(shows)
  let page = first
  for (let read = 1; items.length < limit && page.hasMore && page.nextOffset !== undefined; read++) {
    if (read > PAGES_PAST_HIDDEN) break
    page = await ask(page.nextOffset)
    items = items.concat(page.items.filter(shows))
  }
  const { nextOffset: _, ...rest } = first
  return { ...rest, items: items.slice(0, limit), hasMore: items.length > limit || page.hasMore }
}

/**
 * In a group, each kind reads only the group's accounts of it; a kind it holds none of is left out and named, never
 * read whole: an empty list would mean "every account" to some readers.
 */
const groupScoped = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  only: readonly SearchedResource[] | undefined,
) => {
  const scope = await groupScopeOf(store, env)
  if (scope === undefined) return undefined
  const byKind: Partial<Record<SearchedResource, AccountKey[]>> = accountsByKind(scope, await store.business.accounts())
  // cli-core may search a kind a group holds no accounts of here (meetings); such a kind is left out, not read whole.
  const kinds = (kind: SearchedResource): AccountKey[] => byKind[kind] ?? []
  const wanted = only ?? RESOURCES_SEARCHED
  const kept = wanted.filter((kind) => kinds(kind).length > 0)
  if (kept.length === 0)
    throw new CliError("validation_error", `group ${scope.run.name} holds no account of ${wanted.join(", ")}`)
  return {
    only: kept,
    scope: Object.fromEntries(kept.map((kind) => [kind, kinds(kind)])) as Partial<
      Record<SearchedResource, AccountKey[]>
    >,
    skipped: wanted
      .filter((kind) => !kept.includes(kind))
      .map((resource) => ({
        resource,
        code: "not_found" as const,
        reason: `group ${scope.run.name} holds no account of it`,
      })),
  }
}

/**
 * Messages, mail, notes, calendar events, CRM deals and leads, business data and meeting passages ranked together,
 * with the open tasks that point at a hit. Meetings come from every meeting account, through each one's search index.
 */
export const searchEverywhere = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  {
    text,
    limit,
    only,
    crmKinds,
    source,
    exact,
    timezone,
    plainOrder,
    shows,
    harder,
  }: QueryInput & {
    only?: SearchedResource[]
    source?: string
    crmKinds?: readonly DealKind[]
    shows?: (item: SearchAllItem) => boolean
    /** A hosted model reorders the first hits, if the owner consented (`models search-consents`). */
    harder?: boolean
  },
): Promise<SearchAllFound & EverywhereExtras> => {
  const accounts = await scopedAccounts(store, env)
  const group = await groupScoped(store, env, only)
  // Group lists belong to tg; model downloads belong to memo.
  const messenger = { app: { ...APP, command: "tg" }, hintCommand: "memo" }
  // Hits a permission hides are dropped after the search, so they would already have gone to the model.
  const harderSkipped =
    harder && shows !== undefined ? "a permission hides some kinds here, so no hit was sent to the model" : undefined
  const ask = (offset?: number) =>
    searchAll(
      store,
      MEMO,
      {
        text,
        limit,
        env,
        ...(offset === undefined ? {} : { offset }),
        ...(group === undefined ? (only === undefined ? {} : { only }) : { only: group.only, scope: group.scope }),
        ...(crmKinds === undefined ? {} : { crmKinds }),
        ...(source === undefined ? {} : { source }),
        // memo is the owner's own view of every account, personal and work alike.
        meetingScopes: ["personal", "work"],
        ...(only?.includes("meetings") ? { meetingsAsked: true } : {}),
        ...(exact ? { exact: true } : {}),
        ...(timezone === undefined ? {} : { timezone }),
        ...(harder && harderSkipped === undefined ? { harder: { app: APP } } : {}),
      },
      messenger,
      (query) => searchStore(store, MEMO, query, messenger),
      meaningLane({ env, store: async () => store, messenger: { app: { command: "memo" } } }),
    )
  const searched = shows === undefined ? await ask() : await allowedPage(ask, limit, shows)
  const found = group === undefined ? searched : { ...searched, skipped: [...group.skipped, ...searched.skipped] }
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
    tasks: tasks.slice(0, limit),
    tasksIncomplete: tasksIncomplete || tasks.length > limit,
    ...(harderSkipped === undefined ? {} : { harderSkipped }),
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
  const scope = {
    ...(accounts === undefined ? {} : { accounts }),
    ...(exact ? { exact: true } : {}),
    ...(timezone === undefined ? {} : { timezone }),
  }
  if (kind === "mail")
    return searchMail(
      store,
      MEMO,
      {
        text,
        limit,
        ...scope,
        ...(account === undefined ? {} : { mailAccount: account }),
        ...(plainOrder ? { plainOrder: true } : {}),
      },
      { app: APP },
    )
  const plain = plainQuery(text)
  return searchStore(
    store,
    MEMO,
    {
      text,
      kind,
      ...(hasSource(parseLucene(plain).root) || accounts !== undefined ? {} : { source: "all" as const }),
      limit,
      ...scope,
      // As search all does: a question finds a short reply by the message it answers, and records holding some words.
      ...(!exact && questionLookup(plain) !== undefined ? { discover: true } : {}),
    },
    { app: APP },
  )
}

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
    : { ...found, items: await keyDocumentsFirst(store, found.items, options.project) }
}
