import type { Streams } from "@wirecat/cli-base"
import { MEMORY_KINDS, MEMORY_SCOPES, MEMORY_STATUSES, type Memory } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { authorOf, byOption } from "../author.js"
import { oneOf, positive } from "../options.js"
import { pageOf } from "../page.js"
import { answering } from "../records/run.js"
import { addMemory } from "./memories.js"

interface Filters {
  status?: Memory["status"]
  kind?: Memory["kind"]
  scope?: Memory["scope"]
  subject?: string
  limit: number
  json?: boolean
}

export const memoriesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = answering(streams, env)
  const memories = program
    .command("memories")
    .description("What agents and you concluded, each with its evidence: an agent's waits for you to confirm it")

  byOption(
    memories
      .command("add")
      .description("Write a memory: yours is confirmed at once, an agent's waits as proposed until you confirm it"),
  )
    .argument("<text...>", "what is true, in a sentence or two")
    .requiredOption("--kind <kind>", MEMORY_KINDS.join(", "), oneOf(MEMORY_KINDS))
    .requiredOption("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .requiredOption("--evidence <ref...>", "what shows it: msg:, note:, meeting:, person: or another reference")
    .option("--subject <ref>", "what it is about, as a reference")
    .option("--json", "print JSON")
    .action(
      (
        words: string[],
        options: Omit<Filters, "limit" | "status"> & {
          kind: Memory["kind"]
          scope: Memory["scope"]
          evidence: string[]
          by?: "owner"
        },
      ) =>
        run(options.json, (store) =>
          addMemory(
            store,
            {
              text: words.join(" "),
              kind: options.kind,
              scope: options.scope,
              evidence: options.evidence,
              ...(options.subject === undefined ? {} : { subject: options.subject }),
            },
            authorOf(env, options.by),
          ),
        ),
    )

  memories
    .command("list")
    .description("Memories, newest first")
    .option("--status <status>", MEMORY_STATUSES.join(", "), oneOf(MEMORY_STATUSES))
    .option("--kind <kind>", MEMORY_KINDS.join(", "), oneOf(MEMORY_KINDS))
    .option("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .option("--subject <ref>", "only memories about this reference")
    .option("--limit <n>", "most memories, up to 500", positive, 100)
    .option("--json", "print JSON")
    .action(({ json, ...filters }: Filters) =>
      run(json, (store) => pageOf(filters.limit, (limit) => store.memories.list({ ...filters, limit }))),
    )

  memories
    .command("show")
    .description("One memory with its evidence")
    .argument("<ref>", "memory:<id>")
    .option("--json", "print JSON")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.memories.get(ref)))

  memories
    .command("search")
    .description("Memories holding every word, best first")
    .argument("<words...>", "the words to find")
    .option("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .option("--limit <n>", "most memories, up to 500", positive, 20)
    .option("--json", "print JSON")
    .action((words: string[], options: { scope?: Memory["scope"]; limit: number; json?: boolean }) =>
      run(options.json, (store) =>
        pageOf(
          options.limit,
          (limit) =>
            store.memories.search(words.join(" "), {
              limit,
              ...(options.scope === undefined ? {} : { scope: options.scope }),
            }),
          { fallback: 20, cap: 200 },
        ),
      ),
    )

  memories
    .command("confirm")
    .description("Stand behind a memory: its evidence was checked now")
    .argument("<ref>", "memory:<id>")
    .option("--json", "print JSON")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.memories.confirm(ref)))

  memories
    .command("stale")
    .description("Mark a memory whose evidence no longer holds")
    .argument("<ref>", "memory:<id>")
    .option("--json", "print JSON")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.memories.markStale(ref)))
}
