import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { type AccountKey, type MessageStore, TASK_TYPES, type TaskType } from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
import { queryField, queryTerms } from "../list-query.js"
import { canonicalProject } from "../vocabulary/project.js"
import { taskPage } from "./context.js"

/** The store filters by state, and a project's tasks by kind too; the rows are memo's, not cli-core's task entity. */
export const TASKS_LIST_QUERY = {
  entity: "task",
  backend: "native",
  fields: [
    queryField("state", "enum", "state:done", { values: ["open", "done", "dismissed"] }),
    queryField("kind", "enum", "kind:bug", { values: TASK_TYPES }),
    queryField("project", "kw", "project:HRB", {
      relation: "a project's tasks, by its key or project:<id>, instead of an account's",
    }),
    queryField("ready", "bool", "ready:true", {
      relation: "with project: only open tasks whose prerequisites are done; this claims none",
    }),
    queryField("source", "ref", 'source:"msg:telegram/1/7/1"', {
      relation: "tasks from this message, note or document; an account's tasks only",
    }),
  ],
  defaults: ["state:open"],
} as const satisfies QueryRegistry

const tasksPage = (page: { items: { id: string | number }[]; hasMore: boolean }, limit: number) =>
  listAnswer("tasks list", {
    items: page.items.map((task) => ({ ref: `task:${task.id}`, ...task })),
    limit,
    has_more: page.hasMore,
  })

/**
 * A project's tasks when the query names project:, otherwise the tasks of the account `account` picks; CLI and MCP
 * list through it.
 */
export const listTasks = async (
  store: MessageStore,
  query: readonly string[] | string | undefined,
  limit: number,
  account: () => Promise<AccountKey>,
) => {
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
    if (ready) return tasksPage(await store.tasks.readyTasks(canonical, { limit }), limit)
    const items = await store.tasks.find({
      project: canonical,
      status: state,
      ...(kind === undefined ? {} : { type: kind }),
      limit: limit + 1,
    })
    return tasksPage({ items: items.slice(0, limit), hasMore: items.length > limit }, limit)
  }
  const page = await taskPage(store, await account(), {
    state,
    limit,
    ...(source === undefined ? {} : { sources: [source] }),
  })
  return tasksPage(page, limit)
}
