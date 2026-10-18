import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { formatReference } from "@wirecat/cli-core"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import {
  type AccountKey,
  type MessageStore,
  TASK_TYPES,
  type TaskDetails,
  type TaskType,
} from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
import { accountName } from "../store/source-list.js"
import { canonicalProject } from "../vocabulary/project.js"

/** The store filters by state, and a project's tasks by kind too. */
export const TASKS_LIST_QUERY = {
  entity: "task",
  backend: "native",
  fields: [
    termField("state", "enum", "state:done", { values: ["open", "done", "dismissed"] }),
    termField("kind", "enum", "kind:bug", { values: TASK_TYPES }),
    termField("project", "kw", "project:HRB", {
      relation: "a project's tasks, by its key or project:<id>, instead of an account's",
    }),
    termField("ready", "bool", "ready:true", {
      relation: "with project: only open tasks whose prerequisites are done; this claims none",
    }),
    termField("source", "ref", 'source:"msg:telegram/1/7/1"', {
      relation: "tasks from this message, note or document; an account's tasks only",
    }),
  ],
  defaults: ["state:open"],
} as const satisfies QueryRegistry

type HeldTask = NonNullable<Awaited<ReturnType<MessageStore["tasks"]["get"]>>>

/** A task as cli-core's `task` entity; one found in a message also names its account and chat. */
const taskItem = (task: TaskDetails, held?: HeldTask) => ({
  ref: task.ref,
  id: task.id,
  key: task.key,
  title: task.title,
  description: task.description,
  kind: task.type,
  state: task.status,
  project: task.project,
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
  parent: task.parent,
  due_at: task.dueAt,
  closed_at: task.closedAt,
  reason: task.reason,
  category: task.category,
  claimed_by: task.claimedBy,
  claimed_until: task.claimedUntil,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
})

const tasksPage = (items: ReturnType<typeof taskItem>[], hasMore: boolean, limit: number) =>
  listAnswer("tasks list", { items, limit, has_more: hasMore })

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
    if (held) items.push(taskItem(await store.tasks.details(id), held))
  }
  items.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return listAnswer("tasks list", {
    items: items.slice(0, options.limit),
    limit: options.limit,
    has_more: items.length > options.limit || pages.some((page) => page.hasMore),
    meta: { accounts: keys.map(accountName) },
  })
}

/**
 * A project's tasks when the query names project:, otherwise the tasks of the accounts `accounts` picks; CLI and MCP
 * list through it.
 */
export const listTasks = async (
  store: MessageStore,
  query: readonly string[] | string | undefined,
  limit: number,
  accounts: () => Promise<AccountKey[]>,
) => {
  const flag = Array.isArray(query) ? query.findIndex((word) => /^--[a-z]+$/.test(word)) : -1
  if (flag >= 0) {
    const field = (query as readonly string[])[flag]?.slice(2) ?? ""
    const value = (query as readonly string[])[flag + 1] ?? "<value>"
    const fields: readonly string[] = TASKS_LIST_QUERY.fields.map(({ name }) => name)
    throw new CliError(
      "validation_error",
      fields.includes(field)
        ? `tasks list takes ${field} as a query word: memo tasks list ${field}:${value}`
        : `tasks list has no --${field}; its query words are ${fields.map((name) => `${name}:`).join(", ")}`,
    )
  }
  const terms = queryTerms(query, TASKS_LIST_QUERY, "tasks list")
  const state = terms.get("state") as "open" | "done" | "dismissed"
  const kind = terms.get("kind") as TaskType | undefined
  const source = terms.get("source")
  const project = terms.get("project")
  const ready = terms.get("ready") === "true"
  if (ready && (project === undefined || kind !== undefined || state !== "open"))
    throw new CliError("validation_error", "ready:true lists a project's open tasks: give project: and no kind:")
  if (kind !== undefined && project === undefined)
    throw new CliError("validation_error", "kind: narrows a project's tasks: give project:")
  if (source !== undefined && project !== undefined)
    throw new CliError("validation_error", "source: narrows an account's tasks, not a project's")
  if (project !== undefined) {
    const canonical = await canonicalProject(store, project)
    if (ready) {
      const page = await store.tasks.readyTasks(canonical, { limit })
      return tasksPage(
        await Promise.all(page.items.map(async ({ id }) => taskItem(await store.tasks.details(id)))),
        page.hasMore,
        limit,
      )
    }
    const items = await store.tasks.find({
      project: canonical,
      status: state,
      ...(kind === undefined ? {} : { type: kind }),
      limit: limit + 1,
    })
    return tasksPage(
      items.slice(0, limit).map((task) => taskItem(task)),
      items.length > limit,
      limit,
    )
  }
  return accountTasks(store, await accounts(), {
    state,
    limit,
    ...(source === undefined ? {} : { sources: [source] }),
  })
}
