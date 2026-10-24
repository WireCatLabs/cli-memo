import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, overrideSharedContract, withQuery } from "@wirecat/cli-core/cli"
import { closedStateOf } from "@wirecat/cli-core/services"
import { TASK_ROLES, TASK_TYPES, type TaskRole } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { oneOf, positive, readScope, writeScope } from "../options.js"
import { scopeOf } from "../store/scope.js"
import { ACCOUNTS_HELP, type SourceOptions, theAccounts, type WriteOptions } from "../store/source-list.js"
import { listTasks, TASKS_LIST_QUERY } from "./list.js"
import { taskRelationsCommand } from "./relations-command.js"
import { sharedTaskCommands } from "./shared.js"
import { type AddOptions, addTask, assignTask, closeTask, type UpdateOptions, updateTask } from "./tasks.js"

const priorityOf = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 4) throw new InvalidArgumentError("0 (urgent) to 4 (low)")
  return number
}

const fieldOptions = (command: Command) =>
  command
    .option("--title <title>", "one line saying what is to be done")
    .option("--priority <n>", "0 urgent … 4 low", priorityOf)
    .option("--parent <id>", "the parent task, in the same project")
    .option("--description <text>", "the detail, in Markdown")

export const tasksCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const group = program.command("tasks").description("open work linked to stored messages, documents and emails")
  taskRelationsCommand(group, streams, env)
  const { print } = answers(program, streams, env)
  const warn = (text: string) => streams.diagnostic(text)
  fieldOptions(writeScope(annotate(group.command("add"), { effects: LOCAL_WRITE })))
    .description("add a task from a message, note or document, or one of your own in a project")
    .argument("[source]", "msg: source locator, note:<id> or document:<id>; leave out for a task in a project")
    .option(
      "--type <type>",
      "question, request (default), mention or promise from a source; bug, feature or chore (default) in a project",
      oneOf(TASK_TYPES),
    )
    .option("--project <project>", "a task without a source: the project's key or project:<id>")
    .option("--assignee <person...>", "who does it: a person's UID")
    .option("--into <id>", "link the source to this task instead of opening one that may be the same job")
    .option("--new", "open the task even when one like it is open or was closed in the last 14 days")
    .action(async (source: string | undefined, options: AddOptions & WriteOptions & { json?: boolean }) => {
      await withStore(env, async (store) => {
        const scope = await scopeOf(store, env, options, warn)
        print(options.json, itemAnswer(await addTask(store, env, source, { ...options, ...scope })))
      })
    })
  withQuery(
    readScope(
      annotate(group.command("list"), { effects: LOCAL_READ }).description(
        "tasks of the --source accounts (default all) or of a project, open by default",
      ),
      ACCOUNTS_HELP,
    ),
    TASKS_LIST_QUERY,
  )
    .option("--limit <n>", "most tasks", positive, 100)
    .action(async (words: string[], options: SourceOptions & { limit: number; json?: boolean }) => {
      await withStore(env, async (store) => {
        print(options.json, await listTasks(store, words, options.limit, () => theAccounts(store, env, options, warn)))
      })
    })
  writeScope(
    annotate(group.command("close"), { effects: LOCAL_WRITE })
      .description("close a task as done or dismissed")
      .argument("<id>", "the task's id"),
  )
    .option("--as <state>", "done or dismissed", closedStateOf, "done")
    .option("--reason <text>", "why it is closed")
    .action(
      async (
        id: string,
        options: WriteOptions & { as: ReturnType<typeof closedStateOf>; reason?: string; json?: boolean },
      ) => {
        await withStore(env, async (store) => {
          const scope = await scopeOf(store, env, options, warn)
          print(options.json, itemAnswer(await closeTask(store, env, id, { ...options, ...scope })))
        })
      },
    )

  annotate(group.command("assign"), { effects: LOCAL_WRITE })
    .description("name who works on a task")
    .argument("<id>", "the task's id or key")
    .argument("<person>", "explicit canonical person UID")
    .option("--role <role>", TASK_ROLES.join(", "), oneOf(TASK_ROLES), "assignee")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, person: string, options: { role: TaskRole; json?: boolean }) => {
      await withStore(env, async (store) => {
        print(options.json, itemAnswer(await assignTask(store, id, person, options.role)))
      })
    })
  sharedTaskCommands(program, group, streams, env)
  const sharedUpdate = group.commands.find((command) => command.name() === "update")
  if (!sharedUpdate) throw new Error("shared task update is missing")
  overrideSharedContract(
    sharedUpdate,
    "Memo preserves source-account checks and bare person UIDs; priority and parent edits apply to project tasks only.",
    (command) => {
      command.description(
        "update stored tasks: source edits name --account; priority and parent apply to project tasks",
      )
      command.action(async (id: string, given: UpdateOptions & WriteOptions & { json?: boolean }) => {
        const raw = given as Omit<UpdateOptions, "parent" | "due" | "remindTime"> &
          WriteOptions & { json?: boolean; parent?: string | null; due?: Date | "none"; remindTime?: Date | "none" }
        const options = {
          ...given,
          parent: raw.parent === null ? "none" : raw.parent,
          due: raw.due === "none" ? null : raw.due,
          remindTime: raw.remindTime === "none" ? null : raw.remindTime,
        }
        await withStore(env, async (store) => {
          const scope = await scopeOf(store, env, options, warn)
          print(options.json, itemAnswer(await updateTask(store, env, id, { ...options, ...scope })))
        })
      })
    },
  )
}
