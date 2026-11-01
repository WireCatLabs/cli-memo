import { createHash } from "node:crypto"
import { CliError } from "@wirecat/cli-base"
import { type QueryAst, type QueryRegistry, timezoneOf, walkQuery } from "@wirecat/cli-base/query"
import { formatReference } from "@wirecat/cli-core"
import { listQuery, type QueryWords, typedQuery } from "@wirecat/cli-core/cli"
import {
  type AccountKey,
  isClosedState,
  type MessageStore,
  PROJECT_TASK_FIELDS,
  type TaskDetails,
  type TaskSort,
} from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
import { accountName } from "../store/source-list.js"
import { canonicalProject } from "../vocabulary/project.js"

const OPEN_WORK = "state:(open OR todo OR in_progress)"

/** A project's tasks when the query names project:, otherwise an account's tasks, which know state and source only. */
export const TASKS_LIST_QUERY = {
  entity: "task",
  backend: "sql",
  fields: [
    ...PROJECT_TASK_FIELDS,
    {
      name: "source",
      type: "ref",
      operators: ["term", "phrase"],
      example: 'source:"msg:telegram/1/7/1"',
      relation: "tasks from this message, note or document; an account's tasks only",
    },
  ],
  defaults: [OPEN_WORK],
} as const satisfies QueryRegistry

const ACCOUNT_FIELDS = new Set(["state", "source"])

type HeldTask = NonNullable<Awaited<ReturnType<MessageStore["tasks"]["get"]>>>
type Readiness = Awaited<ReturnType<MessageStore["tasks"]["taskReadiness"]>>

/** A task as cli-core's `task` entity; one found in a message also names its account and chat. */
const taskItem = (task: TaskDetails, extra: { held?: HeldTask; readiness?: Readiness } = {}) => {
  const { held, readiness } = extra
  return {
    ref: task.ref,
    id: task.id,
    key: task.key,
    title: task.title,
    description: task.description,
    kind: task.type,
    state: task.status,
    project: task.project,
    project_key: task.projectKey,
    project_name: task.projectName,
    ...(held
      ? {
          origin: held.origin,
          account: held.account,
          chat:
            held.sourceKind === "note"
              ? null
              : formatReference({
                  type: "chat",
                  provider: held.account.split(":")[0] ?? "",
                  account: held.account.split(":").slice(1).join(":"),
                  chat: held.group,
                }),
        }
      : {}),
    source_message: task.source,
    priority: task.priority,
    priority_label: task.priorityLabel,
    agent: task.agent,
    revision: task.revision,
    parent: task.parent,
    due_at: task.dueAt,
    closed_at: task.closedAt,
    reason: task.reason,
    category: task.category,
    claimed_by: task.claimedBy,
    claimed_until: task.claimedUntil,
    ...(readiness ? { assignments: task.assignments, ready: readiness.ready, blocked_by: readiness.blockers } : {}),
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  }
}

/** Each account's first page in the store's order, oldest first, so the first `limit` of them all are among them. */
const accountTasks = async (
  store: MessageStore,
  keys: readonly AccountKey[],
  options: { state: "open" | "done" | "dismissed"; limit: number; sources?: string[] },
) => {
  const pages = await Promise.all(keys.map((key) => store.knowledge.taskIds(key, options)))
  const items: ReturnType<typeof taskItem>[] = []
  for (const id of pages.flatMap((page) => page.items)) {
    const held = await store.tasks.get(id)
    if (held) items.push(taskItem(await store.tasks.details(id), { held }))
  }
  items.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return listAnswer("tasks list", {
    items: items.slice(0, options.limit),
    limit: options.limit,
    has_more: items.length > options.limit || pages.some((page) => page.hasMore),
    meta: { accounts: keys.map(accountName) },
  })
}

/** An account's task is open, done or dismissed: the default open work reads as open. */
const accountTerms = (query: QueryAst | undefined) => {
  const leaves = query ? walkQuery(query.root) : []
  const other = leaves.find(({ field }) => !ACCOUNT_FIELDS.has(field))
  if (other)
    throw new CliError(
      "validation_error",
      `${other.field}: narrows project tasks: add project:<key>, or project:* for every project`,
    )
  const states = new Set(leaves.filter(({ field }) => field === "state").map(({ value }) => value.toLowerCase()))
  if ((states.has("todo") || states.has("in_progress")) && !states.has("open"))
    throw new CliError("validation_error", "todo and in_progress are steps of a project task: add project:")
  const closed = [...states].filter(isClosedState)
  if (closed.length > 1 || (closed.length === 1 && states.size > 1))
    throw new CliError("validation_error", "an account's tasks are listed in one state: state:open, done or dismissed")
  const sources = leaves.filter(({ field }) => field === "source").map(({ value }) => value)
  if (sources.length > 1) throw new CliError("validation_error", "source: only once here")
  return { state: closed[0] ?? ("open" as const), source: sources[0] }
}

/** A project named by its key, name or alias reads as `project:<id>`, as tasks add takes it. */
const resolveProjects = async (store: MessageStore, query: QueryAst | undefined) => {
  for (const node of query ? walkQuery(query.root) : [])
    if (node.field === "project" && node.operator !== "wildcard" && node.operator !== "range")
      node.value = await canonicalProject(store, node.value)
  return query
}

interface Cursor {
  version: 1
  key: string
  offset: number
}

const offsetOf = (cursor: string | undefined, key: string): number => {
  if (cursor === undefined) return 0
  let read: Cursor | undefined
  try {
    read = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Cursor
  } catch {
    read = undefined
  }
  if (read?.version !== 1 || read.key !== key || !Number.isSafeInteger(read.offset) || read.offset < 0)
    throw new CliError("validation_error", "the cursor belongs to another query or order; list again without it")
  return read.offset
}

export interface ListOptions {
  limit: number
  cursor?: string
  sort?: TaskSort
  desc?: boolean
}

const projectTasks = async (store: MessageStore, typed: string, query: QueryAst, options: ListOptions) => {
  const { limit, sort = "priority", desc = false } = options
  const key = createHash("sha256")
    .update(JSON.stringify([typed, sort, desc]))
    .digest("base64url")
  const offset = offsetOf(options.cursor, key)
  const page = await store.tasks.board(query, { limit, offset, sort, descending: desc, zone: timezoneOf() })
  const items = []
  for (const task of page.items) items.push(taskItem(task, { readiness: await store.tasks.taskReadiness(task.id) }))
  const next = offset + items.length
  const more = next < page.total
  return listAnswer("tasks list", {
    items,
    limit,
    has_more: more,
    paging: "cursor",
    ...(more
      ? {
          cursor: Buffer.from(JSON.stringify({ version: 1, key, offset: next } satisfies Cursor)).toString("base64url"),
        }
      : {}),
    total: { value: page.total, relation: "eq" },
    args: { query: typed, ...(options.sort ? { sort } : {}), ...(desc ? { desc: true } : {}) },
  })
}

/**
 * Project tasks when the query names project: (project:* is every project), otherwise the tasks of the accounts
 * `accounts` picks; CLI and MCP list through it.
 */
export const listTasks = async (
  store: MessageStore,
  words: QueryWords,
  options: ListOptions,
  accounts: () => Promise<AccountKey[]>,
) => {
  const flag = Array.isArray(words) ? words.findIndex((word) => /^--[a-z]+$/.test(word)) : -1
  if (flag >= 0) {
    const field = (words as readonly string[])[flag]?.slice(2) ?? ""
    const value = (words as readonly string[])[flag + 1] ?? "<value>"
    const fields: readonly string[] = TASKS_LIST_QUERY.fields.map(({ name }) => name)
    throw new CliError(
      "validation_error",
      fields.includes(field)
        ? `tasks list takes ${field} as a query word: memo tasks list ${field}:${value}`
        : `tasks list has no --${field}; its query words are ${fields.map((name) => `${name}:`).join(", ")}`,
    )
  }
  const typed = typedQuery(words)
  const query = listQuery(typed, TASKS_LIST_QUERY, "tasks list", { defaultField: "text" })
  const leaves = query ? walkQuery(query.root) : []
  if (leaves.some(({ field }) => field === "project")) {
    if (leaves.some(({ field }) => field === "source"))
      throw new CliError("validation_error", "source: narrows an account's tasks, not a project's")
    return projectTasks(store, typed, (await resolveProjects(store, query)) as QueryAst, options)
  }
  if (options.cursor !== undefined || options.sort !== undefined || options.desc)
    throw new CliError("validation_error", "--cursor, --sort and --desc page and order project tasks: add project:")
  const { state, source } = accountTerms(query)
  return accountTasks(store, await accounts(), {
    state,
    limit: options.limit,
    ...(source === undefined ? {} : { sources: [source] }),
  })
}

/** The board's pickers: every project task when the query names no project:. */
export const countTasks = async (store: MessageStore, words: QueryWords) => {
  const query = listQuery(typedQuery(words), TASKS_LIST_QUERY, "tasks counts", { defaultField: "text" })
  if (query && walkQuery(query.root).some(({ field }) => field === "source"))
    throw new CliError("validation_error", "source: narrows an account's tasks; tasks counts counts project tasks")
  return store.tasks.boardCounts(await resolveProjects(store, query), { zone: timezoneOf() })
}
