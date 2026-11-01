import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, overrideSharedContract, withQuery } from "@wirecat/cli-core/cli"
import { closedStateOf } from "@wirecat/cli-core/services"
import {
  PRIORITY_LABELS,
  priorityOf,
  TASK_ROLES,
  TASK_SORTS,
  TASK_STATES,
  TASK_TYPES,
  type TaskRole,
  type TaskState,
} from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { oneOf, positive, readScope, writeScope } from "../options.js"
import { withOwner } from "../people/owner.js"
import { scopeOf } from "../store/scope.js"
import { ACCOUNTS_HELP, type SourceOptions, theAccounts, type WriteOptions } from "../store/source-list.js"
import { countTasks, type ListOptions, listTasks, TASKS_LIST_QUERY } from "./list.js"
import { taskRelationsCommand } from "./relations-command.js"
import { sharedTaskCommands } from "./shared.js"
import {
  type AddOptions,
  addTask,
  assignTask,
  closeTask,
  moveTask,
  taskHistory,
  type UpdateOptions,
  unassignTask,
  updateTask,
} from "./tasks.js"

const revisionOf = (value: string): number => {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new InvalidArgumentError("the revision a read gave")
  return number
}
const REVISION_HELP = "refuse the write unless the task is still at this revision (task.stale, exit 3)"

const fieldOptions = (command: Command) =>
  command
    .option("--title <title>", "one line saying what is to be done")
    .option("--priority <n>", `${PRIORITY_LABELS.join(", ")}; 0 (urgent) … 4 (low) still read as before`, priorityOf)
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
    .option("--limit <n>", "most tasks, at most 500 for a project's", positive, 100)
    .option("--sort <field>", `project tasks: ${TASK_SORTS.join(", ")} (default priority)`, oneOf(TASK_SORTS))
    .option("--desc", "project tasks: the --sort order reversed")
    .option("--cursor <cursor>", "project tasks: the next page, from page.next_cursor, with the same query and order")
    .action(async (words: string[], options: SourceOptions & ListOptions & { json?: boolean }) => {
      await withStore(env, async (store) => {
        print(options.json, await listTasks(store, words, options, () => theAccounts(store, env, options, warn)))
      })
    })
  withQuery(
    annotate(group.command("counts"), { effects: LOCAL_READ, output: { entity: "task_counts" } }).description(
      "how many project tasks match, by project, assignee, priority and state",
    ),
    TASKS_LIST_QUERY,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      await withStore(env, async (store) => {
        print(options.json, itemAnswer(await countTasks(store, words)))
      })
    })
  annotate(group.command("history"), { effects: LOCAL_READ, output: { entity: "task_event" } })
    .description("who changed a task, what and when, oldest first")
    .argument("<id>", "the task's id or key")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, options: { json?: boolean }) => {
      await withStore(env, async (store) => {
        print(options.json, wholeList("tasks history", await taskHistory(store, id)))
      })
    })
  writeScope(
    annotate(group.command("close"), { effects: LOCAL_WRITE })
      .description("close a task as done or dismissed")
      .argument("<id>", "the task's id"),
  )
    .option("--as <state>", "done or dismissed", closedStateOf, "done")
    .option("--reason <text>", "why it is closed")
    .option("--revision <n>", REVISION_HELP, revisionOf)
    .action(
      async (
        id: string,
        options: WriteOptions & {
          as: ReturnType<typeof closedStateOf>
          reason?: string
          revision?: number
          json?: boolean
        },
      ) => {
        await withStore(env, async (store) => {
          const scope = await scopeOf(store, env, options, warn)
          print(options.json, itemAnswer(await closeTask(store, env, id, { ...options, ...scope })))
        })
      },
    )

  annotate(group.command("assign"), { effects: LOCAL_WRITE })
    .description("name who works on a task, or with --clear take them off it")
    .argument("<id>", "the task's id or key")
    .argument("<person>", "explicit canonical person UID")
    .option("--role <role>", TASK_ROLES.join(", "), oneOf(TASK_ROLES), "assignee")
    .option("--clear", "take the person off the task in that role, instead of adding them")
    .option("--revision <n>", REVISION_HELP, revisionOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        id: string,
        person: string,
        options: { role: TaskRole; clear?: boolean; revision?: number; json?: boolean },
      ) => {
        await withStore(env, async (store) => {
          const who = await withOwner(store, person)
          const change = options.clear ? unassignTask : assignTask
          print(options.json, itemAnswer(await change(store, env, id, who, options.role, options.revision)))
        })
      },
    )
  annotate(group.command("move"), { effects: LOCAL_WRITE, output: { entity: "task_move" } })
    .summary("put a project task before or after another in its board column")
    .description(
      "put a project task before or after another in its board column: it takes a priority between them, " +
        "and the answer says when its label changed; beside a task in another column it moves into that column",
    )
    .argument("<id>", "the task's id or key")
    .option(
      "--status <state>",
      `move it to this column too: ${TASK_STATES.join(", ")}; with --before or --after it must be that task's column`,
      oneOf(TASK_STATES as readonly TaskState[]),
    )
    .option("--before <id>", "the task it goes just above")
    .option("--after <id>", "the task it goes just below")
    .option("--revision <n>", REVISION_HELP, revisionOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        id: string,
        options: { status?: TaskState; before?: string; after?: string; revision?: number; json?: boolean },
      ) => {
        await withStore(env, async (store) => {
          print(options.json, itemAnswer(await moveTask(store, env, id, options)))
        })
      },
    )
  sharedTaskCommands(program, group, streams, env)
  const sharedUpdate = group.commands.find((command) => command.name() === "update")
  if (!sharedUpdate) throw new Error("shared task update is missing")
  overrideSharedContract(
    sharedUpdate,
    "Memo preserves source-account checks and bare person UIDs; priority and parent edits apply to project tasks only.",
    (command) => {
      command
        .description(
          "update stored tasks: source edits name --account; priority, parent and status apply to project tasks",
        )
        .option("--agent <agent>", "a project task: the agent working on it, apart from its assignees; none clears it")
        .option("--revision <n>", REVISION_HELP, revisionOf)
        .option(
          "--status <state>",
          `a project task's state: ${TASK_STATES.join(", ")}; a closed one reopens`,
          oneOf(TASK_STATES as readonly TaskState[]),
        )
      command.action(async (id: string, given: UpdateOptions & WriteOptions & { json?: boolean }) => {
        const raw = given as Omit<UpdateOptions, "parent" | "due" | "remindTime" | "priority"> &
          WriteOptions & {
            json?: boolean
            parent?: string | null
            due?: Date | "none"
            remindTime?: Date | "none"
            priority?: number | "none"
          }
        const options = {
          ...given,
          priority: raw.priority === "none" ? null : raw.priority,
          parent: raw.parent === null || raw.parent === "none" ? null : raw.parent,
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
