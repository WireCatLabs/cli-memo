import type { Streams } from "@wirecat/cli-base"
import { type MessageStore, TASK_RELATION_KINDS, type TaskRelationKind } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { oneOf } from "../options.js"
import { answering } from "../records/run.js"

export const taskRelationsCommand = (tasks: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const run = answering(streams, env)
  const execute = (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) =>
    run(options.json, work)
  for (const operation of ["link", "unlink"] as const) {
    tasks
      .command(operation)
      .description(`${operation} reviewed project task relationships`)
      .argument("<task>", "the task: task:<id> or its id")
      .argument("<other-task>", "the task it relates to: task:<id> or its id")
      .requiredOption("--kind <kind>", TASK_RELATION_KINDS.join(", "), oneOf(TASK_RELATION_KINDS))
      .option("--json", "print JSON")
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
    .option("--json", "print JSON")
    .action((task: string, options: { json?: boolean }) =>
      execute(options, async (store) => ({ items: await store.tasks.taskRelations(task) })),
    )
  tasks
    .command("status")
    .description("whether a task can start, and what it still waits for")
    .argument("<task>", "the task: task:<id> or its id")
    .option("--json", "print JSON")
    .action((task: string, options: { json?: boolean }) => execute(options, (store) => store.tasks.taskReadiness(task)))
}
