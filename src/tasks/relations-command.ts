import { createRenderer, type Streams } from "@wirecat/cli-core"
import { type MessageStore, openStore, TASK_RELATION_KINDS, type TaskRelationKind } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { oneOf, positive } from "../options.js"
import { canonicalProject } from "../vocabulary/project.js"

export const taskRelationsCommand = (tasks: Command, streams: Streams, env: NodeJS.ProcessEnv) => {
  const execute = async (options: { json?: boolean }, work: (store: MessageStore) => Promise<unknown>) => {
    const store = await openStore({ env })
    try {
      const result = await work(store)
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(result)
      else streams.data(`${JSON.stringify(result, null, 2)}\n`)
    } finally {
      await store.close()
    }
  }
  for (const operation of ["link", "unlink"] as const) {
    tasks
      .command(operation)
      .description(`${operation} reviewed project task relationships`)
      .argument("<task>")
      .argument("<other-task>")
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
    .description("A task's links to other tasks")
    .argument("<task>")
    .option("--json", "print JSON")
    .action((task: string, options: { json?: boolean }) =>
      execute(options, async (store) => ({ items: await store.tasks.taskRelations(task) })),
    )
  tasks
    .command("readiness")
    .description("Whether a task can start, and what it still waits for")
    .argument("<task>")
    .option("--json", "print JSON")
    .action((task: string, options: { json?: boolean }) => execute(options, (store) => store.tasks.taskReadiness(task)))
  tasks
    .command("ready")
    .description("Discover project work with completed prerequisites; this does not claim a task")
    .requiredOption("--project <project>", "canonical project reference, key or explicit alias")
    .option("--limit <n>", "tasks per page", positive)
    .option("--json", "print JSON")
    .action((options: { project: string; limit?: number; json?: boolean }) =>
      execute(options, async (store) =>
        store.tasks.readyTasks(await canonicalProject(store, options.project), {
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        }),
      ),
    )
}
