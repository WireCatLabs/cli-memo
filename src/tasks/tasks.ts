import { CliError } from "@wirecat/cli-base"
import { parseLocator } from "@wirecat/cli-core"
import {
  type ClosedTask,
  type closedStateOf,
  storeOnlyDeps,
  type TasksService,
  tasksService,
} from "@wirecat/cli-core/services"
import {
  type AccountKey,
  type MessageStore,
  type TaskFields,
  type TaskRole,
  type TaskType,
  WORK_TASK_TYPES,
  type WorkTaskType,
} from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { isNoteReference } from "../notes/about.js"
import { heldMessage } from "../store/held.js"
import { type AccountScope, selectAccount } from "../store/scope.js"
import { canonicalProject } from "../vocabulary/project.js"

export interface FieldOptions {
  title?: string
  priority?: number
  parent?: string
  description?: string
}

export type AddOptions = AccountScope &
  FieldOptions & {
    type?: TaskType
    project?: string
    assignee?: string[]
    into?: string
    new?: boolean
  }

type Details = Awaited<ReturnType<MessageStore["tasks"]["details"]>>
type Added = Awaited<ReturnType<TasksService["add"]>>
type Closed = ClosedTask | Awaited<ReturnType<MessageStore["tasks"]["edit"]>>

const personRef = (person: string) => (person.startsWith("person:") ? person : `person:${person}`)

export const fieldsOf = (options: FieldOptions): TaskFields => ({
  ...(options.title === undefined ? {} : { title: options.title }),
  ...(options.priority === undefined ? {} : { priority: options.priority }),
  ...(options.parent === undefined ? {} : { parent: options.parent }),
  ...(options.description === undefined ? {} : { description: options.description }),
})

const assignAll = async (store: MessageStore, id: string, people: string[] | undefined) => {
  for (const person of people ?? []) await store.tasks.assign(id, { to: personRef(person), role: "assignee" }, "owner")
}

const addToProject = async (store: MessageStore, options: AddOptions) => {
  if (options.project === undefined || options.title === undefined)
    throw new CliError("validation_error", "a task without a source needs --project and --title")
  if (options.into !== undefined || options.new)
    throw new CliError("validation_error", "--into and --new are for a task from a source")
  const type = options.type ?? "chore"
  if (!(WORK_TASK_TYPES as readonly string[]).includes(type))
    throw new CliError("validation_error", `a task in a project is ${WORK_TASK_TYPES.join(", ")}`)
  const task = await store.tasks.create(
    {
      project: await canonicalProject(store, options.project),
      title: options.title,
      type: type as WorkTaskType,
      ...fieldsOf(options),
    },
    "owner",
  )
  await assignAll(store, task.id, options.assignee)
  return store.tasks.details(task.id)
}

/** A file from a notes folder names its account, the folder; a note written with `notes add` names none. */
const folderOf = async (store: MessageStore, source: string): Promise<AccountKey | undefined> => {
  const folderId = (await store.notes.resolveNote(source.trim()))?.folderId
  if (folderId == null) return undefined
  const folder = (await store.accounts.storedAccounts()).find(({ id }) => String(id) === folderId)
  return folder && { provider: folder.provider, account: folder.account }
}

const addFromSource = async (store: MessageStore, env: NodeJS.ProcessEnv, source: string, options: AddOptions) => {
  if (options.project !== undefined)
    throw new CliError("validation_error", "a task from a source goes in its account; --project is for one without")
  const type = options.type ?? "request"
  if ((WORK_TASK_TYPES as readonly string[]).includes(type))
    throw new CliError("validation_error", "a bug, feature or chore has no source: give --project and --title")
  const native = isNoteReference(source.trim())
  const parsed = native ? undefined : parseLocator(source)
  if (
    parsed &&
    ((options.provider && options.provider !== parsed.provider) ||
      (options.account && options.account !== parsed.account))
  )
    throw new CliError("validation_error", "locator and selected account disagree")
  const key = parsed
    ? { provider: parsed.provider, account: parsed.account }
    : ((options.provider === undefined ? await folderOf(store, source) : undefined) ??
      (await selectAccount(store, options)))
  if (
    parsed &&
    parsed.provider !== "notes" &&
    (await heldMessage(store, key, parsed.message, parsed.chat)) === undefined
  )
    throw new CliError("not_found", "the task source is unavailable or deleted")
  const answer = await tasksService(storeOnlyDeps(store, key, { app: APP, env })).add(
    source,
    type as Exclude<TaskType, WorkTaskType>,
    "owner",
    undefined,
    {
      ...(options.into === undefined ? {} : { attach: options.into }),
      ...(options.new ? { new: true } : {}),
    },
  )
  const fields = fieldsOf(options)
  if (Object.keys(fields).length === 0 && !options.assignee?.length) return answer
  await store.tasks.edit(answer.task.id, fields, "owner")
  await assignAll(store, answer.task.id, options.assignee)
  return { ...answer, details: await store.tasks.details(answer.task.id) }
}

/** A task in a project when no source is given, otherwise one from the source in its account. */
export const addTask = (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  source: string | undefined,
  options: AddOptions,
): Promise<Details | Added | (Added & { details: Details })> =>
  source === undefined ? addToProject(store, options) : addFromSource(store, env, source, options)

export const closeTask = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  id: string,
  options: AccountScope & { as: ReturnType<typeof closedStateOf>; reason?: string },
): Promise<Closed> => {
  if ((await store.tasks.get(id)) === undefined) {
    const reason = options.reason === undefined ? {} : { reason: options.reason }
    return store.tasks.edit(id, { status: options.as, ...reason }, "owner")
  }
  const key = await selectAccount(store, options)
  return tasksService(storeOnlyDeps(store, key, { app: APP, env })).close(id, {
    as: options.as,
    by: "owner",
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  })
}

export type UpdateOptions = AccountScope &
  FieldOptions & {
    due?: Date | null
    remindTime?: Date | null
    category?: string
    assignee?: string[]
  }

/**
 * A project task is edited in the store; a task from a message goes through cli-core's plan, which checks the
 * category, refuses a due date on a closed task and resolves `sender`.
 */
export const updateTask = async (store: MessageStore, env: NodeJS.ProcessEnv, id: string, options: UpdateOptions) => {
  const fields = fieldsOf(options)
  const times = {
    ...(options.due === undefined ? {} : { dueAt: options.due }),
    ...(options.remindTime === undefined ? {} : { nextCheckAt: options.remindTime }),
  }
  if (
    Object.keys(fields).length + Object.keys(times).length === 0 &&
    options.category === undefined &&
    options.assignee === undefined
  )
    throw new CliError(
      "validation_error",
      "give --title, --description, --priority, --parent, --due, --remind-time, --category or --assignee",
    )
  if ((await store.tasks.get(id)) === undefined) {
    if (options.category !== undefined || options.assignee !== undefined)
      throw new CliError(
        "validation_error",
        "--category and --assignee are for a task from a source; name a project task's people with tasks assign",
      )
    return store.tasks.edit(id, { ...fields, ...times }, "owner")
  }
  if (options.priority !== undefined || options.parent !== undefined)
    throw new CliError("validation_error", "--priority and --parent are for a task in a project")
  const assignees = options.assignee?.map((one) => (one === "sender" || one === "none" ? one : personRef(one)))
  const key = await selectAccount(store, options)
  return tasksService(storeOnlyDeps(store, key, { app: APP, env })).plan(
    id,
    {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.description === undefined ? {} : { description: options.description }),
      ...times,
      ...(options.category === undefined ? {} : { category: options.category }),
      ...(assignees === undefined
        ? {}
        : { assignees: assignees.length === 1 && assignees[0] === "none" ? null : assignees }),
    },
    "owner",
  )
}

export const assignTask = (store: MessageStore, id: string, person: string, role: TaskRole) =>
  store.tasks.assign(id, { to: personRef(person), role }, "owner")
