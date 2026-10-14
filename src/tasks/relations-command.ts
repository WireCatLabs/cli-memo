import type { Streams } from "@wirecat/cli-base"
import { type MessageStore, TASK_RELATION_KINDS, type TaskRelationKind } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList } from "../answer.js"
import { oneOf } from "../options.js"

export const taskRelationsCommand = (tasks: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const { run } = answers(tasks, streams, env)
  const execute = (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) =>
    run(options.json, async (store) => itemAnswer(await work(store)))
  for (const operation of ["link", "unlink"] as const) {
    tasks
      .command(operation)
      .description(`${operation} reviewed project task relationships`)
      .argument("<task>", "the task: task:<id> or its id")
      .argument("<other-task>", "the task it relates to: task:<id> or its id")
      .requiredOption("--kind <kind>", TASK_RELATION_KINDS.join(", "), oneOf(TASK_RELATION_KINDS))
      .option("--json", "print JSON; --json=id,title keeps only those fields")
      .action((task: string, other: string, options: { kind: TaskRelationKind; json?: boolean }) =>
        execute(options, (store) =>
          operation === "link"
            ? store.tasks.linkTask(task, other, options.kind, "owner")
            : store.tasks.unlinkTask(task, other, options.kind, "owner"),
        ),
      )
  }
  tasks
    .command("relations")
    .description("a task's links to other tasks")
    .argument("<task>", "the task: task:<id> or its id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((task: string, options: { json?: boolean }) =>
      run(options.json, async (store) => wholeList("tasks relations", await store.tasks.taskRelations(task))),
    )
  tasks
    .command("status")
    .description("whether a task can start, and what it still waits for")
    .argument("<task>", "the task: task:<id> or its id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((task: string, options: { json?: boolean }) => execute(options, (store) => store.tasks.taskReadiness(task)))
}
