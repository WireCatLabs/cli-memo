import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { type MessageStore, TASK_RELATION_KINDS, type TaskRelationKind } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList } from "../answer.js"
import { oneOf } from "../options.js"

export const taskRelationsCommand = (tasks: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const { run } = answers(tasks, streams, env)
  const execute = (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) =>
    run(options.json, async (store) => itemAnswer(await work(store)))
  for (const operation of ["unlink"] as const) {
    annotate(tasks.command(operation), { effects: LOCAL_WRITE })
      .description(`${operation} reviewed project task relationships`)
      .argument("<task>", "the task: task:<id> or its id")
      .argument("<other-task>", "the task it relates to: task:<id> or its id")
      .requiredOption("--kind <kind>", TASK_RELATION_KINDS.join(", "), oneOf(TASK_RELATION_KINDS))
      .option("--json", "print JSON; --json=id,title keeps only those fields")
      .action((task: string, other: string, options: { kind: TaskRelationKind; json?: boolean }) =>
        execute(options, (store) => store.tasks.unlinkTask(task, other, options.kind, "owner")),
      )
  }
  annotate(tasks.command("links"), { effects: LOCAL_READ })
    .description("a task's links to other tasks")
    .argument("<task>", "the task: task:<id> or its id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((task: string, options: { json?: boolean }) =>
      run(options.json, async (store) => wholeList("tasks links", await store.tasks.taskRelations(task))),
    )
  annotate(tasks.command("status"), { effects: LOCAL_READ })
    .description("whether a task can start, and what it still waits for")
    .argument("<task>", "the task: task:<id> or its id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((task: string, options: { json?: boolean }) => execute(options, (store) => store.tasks.taskReadiness(task)))
}
