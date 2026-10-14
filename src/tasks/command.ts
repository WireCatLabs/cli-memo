import { CliError, type Streams } from "@wirecat/cli-base"
import { parseLocator } from "@wirecat/cli-core"
import { closedStateOf, storeOnlyDeps, taskStateOf, tasksService } from "@wirecat/cli-core/services"
import {
  type MessageStore,
  openStore,
  TASK_ROLES,
  TASK_TYPES,
  type TaskFields,
  type TaskRole,
  type TaskType,
  WORK_TASK_TYPES,
  type WorkTaskType,
} from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { APP } from "../app.js"
import { isNoteReference } from "../notes/about.js"
import { accountOptions, oneOf, positive } from "../options.js"
import { printing } from "../records/run.js"
import { heldMessage } from "../store/held.js"
import { type AccountScope, selectAccount } from "../store/scope.js"
import { canonicalProject } from "../vocabulary/project.js"
import { taskPage } from "./context.js"
import { taskRelationsCommand } from "./relations-command.js"

interface FieldOptions {
  title?: string
  priority?: number
  parent?: string
  description?: string
}

const priorityOf = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 4) throw new InvalidArgumentError("0 (urgent) to 4 (low)")
  return number
}

const personRef = (person: string) => (person.startsWith("person:") ? person : `person:${person}`)

const fieldsOf = (options: FieldOptions): TaskFields => ({
  ...(options.title === undefined ? {} : { title: options.title }),
  ...(options.priority === undefined ? {} : { priority: options.priority }),
  ...(options.parent === undefined ? {} : { parent: options.parent }),
  ...(options.description === undefined ? {} : { description: options.description }),
})

const fieldOptions = (command: Command) =>
  command
    .option("--title <title>", "one line saying what is to be done")
    .option("--priority <n>", "0 urgent … 4 low", priorityOf)
    .option("--parent <task>", "the parent task, in the same project")
    .option("--description <text>", "the detail, in Markdown")

const assignAll = async (store: MessageStore, id: string, people: string[] | undefined) => {
  for (const person of people ?? []) await store.tasks.assign(id, { to: personRef(person), role: "assignee" }, "owner")
}

export const tasksCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program.command("tasks").description("open work linked to stored messages, documents and emails")
  taskRelationsCommand(group, streams, env)
  const print = printing(streams)
  fieldOptions(accountOptions(group.command("add")))
    .description("add a task from a message, note or document, or one of your own in a project")
    .argument("[source]", "msg: source locator, note:<id> or document:<id>; leave out for a task in a project")
    .option(
      "--type <type>",
      "question, request (default), mention or promise from a source; bug, feature or chore (default) in a project",
      oneOf(TASK_TYPES),
    )
    .option("--project <project>", "a task without a source: the project's key or project:<id>")
    .option("--assignee <person...>", "who does it: a person's UID")
    .action(
      async (
        source: string | undefined,
        options: AccountScope &
          FieldOptions & { type?: TaskType; project?: string; assignee?: string[]; json?: boolean },
      ) => {
        const store = await openStore({ env })
        try {
          if (source === undefined) {
            if (options.project === undefined || options.title === undefined)
              throw new CliError("validation_error", "a task without a source needs --project and --title")
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
            print(options.json, await store.tasks.details(task.id))
            return
          }
          if (options.project !== undefined)
            throw new CliError(
              "validation_error",
              "a task from a source goes in its account; --project is for one without",
            )
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
            : await selectAccount(store, options)
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
          )
          const fields = fieldsOf(options)
          if (Object.keys(fields).length === 0 && !options.assignee?.length) {
            print(options.json, answer)
            return
          }
          await store.tasks.edit(answer.task.id, fields, "owner")
          await assignAll(store, answer.task.id, options.assignee)
          print(options.json, { ...answer, details: await store.tasks.details(answer.task.id) })
        } finally {
          await store.close()
        }
      },
    )
  accountOptions(group.command("list").description("tasks of one account or one project, open by default"))
    .option("--state <state>", "open, done or dismissed", taskStateOf, "open")
    .option("--project <project>", "a project's tasks, by its key or project:<id>, instead of an account's")
    .option("--ready", "with --project: only open tasks whose prerequisites are done; this claims none")
    .option("--limit <n>", "most tasks", positive, 100)
    .action(
      async (
        options: AccountScope & {
          state: ReturnType<typeof taskStateOf>
          project?: string
          ready?: boolean
          limit: number
          json?: boolean
        },
      ) => {
        if (options.ready && (options.project === undefined || options.state !== "open"))
          throw new CliError("validation_error", "--ready lists a project's open tasks: give --project, not --state")
        const store = await openStore({ env })
        try {
          if (options.ready && options.project !== undefined) {
            const page = await store.tasks.readyTasks(await canonicalProject(store, options.project), {
              limit: options.limit,
            })
            print(options.json, { ...page, items: page.items.map((task) => ({ ref: `task:${task.id}`, ...task })) })
            return
          }
          if (options.project !== undefined) {
            const items = await store.tasks.find({
              project: await canonicalProject(store, options.project),
              status: options.state,
              limit: options.limit + 1,
            })
            print(options.json, { items: items.slice(0, options.limit), hasMore: items.length > options.limit })
            return
          }
          const key = await selectAccount(store, options)
          const page = await taskPage(store, key, { state: options.state, limit: options.limit })
          print(options.json, { ...page, items: page.items.map((task) => ({ ref: `task:${task.id}`, ...task })) })
        } finally {
          await store.close()
        }
      },
    )
  accountOptions(
    group.command("close").description("close a task as done or dismissed").argument("<id>", "the task's id"),
  )
    .option("--as <state>", "done or dismissed", closedStateOf, "done")
    .option("--reason <text>", "why it is closed")
    .action(
      async (
        id: string,
        options: AccountScope & { as: ReturnType<typeof closedStateOf>; reason?: string; json?: boolean },
      ) => {
        const store = await openStore({ env })
        try {
          if ((await store.tasks.get(id)) === undefined) {
            const reason = options.reason === undefined ? {} : { reason: options.reason }
            print(options.json, await store.tasks.edit(id, { status: options.as, ...reason }, "owner"))
            return
          }
          const key = await selectAccount(store, options)
          print(
            options.json,
            await tasksService(storeOnlyDeps(store, key, { app: APP, env })).close(id, {
              as: options.as,
              by: "owner",
              ...(options.reason === undefined ? {} : { reason: options.reason }),
            }),
          )
        } finally {
          await store.close()
        }
      },
    )
  fieldOptions(group.command("update").description("change a task's title, priority, parent or description"))
    .argument("<id>", "the task's id or key")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, options: FieldOptions & { json?: boolean }) => {
      const fields = fieldsOf(options)
      if (Object.keys(fields).length === 0)
        throw new CliError("validation_error", "give --title, --priority, --parent or --description")
      const store = await openStore({ env })
      try {
        print(options.json, await store.tasks.edit(id, fields, "owner"))
      } finally {
        await store.close()
      }
    })
  group
    .command("assign")
    .description("name who works on a task")
    .argument("<id>", "the task's id or key")
    .argument("<person>", "explicit canonical person UID")
    .option("--role <role>", TASK_ROLES.join(", "), oneOf(TASK_ROLES), "assignee")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, person: string, options: { role: TaskRole; json?: boolean }) => {
      const store = await openStore({ env })
      try {
        print(options.json, await store.tasks.assign(id, { to: personRef(person), role: options.role }, "owner"))
      } finally {
        await store.close()
      }
    })
}
