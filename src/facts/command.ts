import type { Streams } from "@wirecat/cli-base"
import { FACT_STATUSES, FACT_TYPES, type Fact, MEMORY_SCOPES } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { oneOf, positive } from "../options.js"
import { pageOf } from "../page.js"
import { answering } from "../records/run.js"

interface Filters {
  type?: Fact["type"]
  status?: Fact["status"]
  project?: string
  subject?: string
  limit: number
  json?: boolean
}

interface AddOptions {
  type: Fact["type"]
  evidence?: string[]
  project?: string
  subject?: string
  occurred?: string
  scope?: (typeof MEMORY_SCOPES)[number]
  supersedes?: string
  json?: boolean
}

export const factsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = answering(streams, env)
  const facts = program
    .command("facts")
    .description("What happened — said, asked, decided, promised — with its evidence: agents propose, you accept")

  facts
    .command("add")
    .description("Record a fact of your own; it is accepted at once")
    .argument("<statement...>", "what happened, in one sentence")
    .requiredOption("--type <type>", FACT_TYPES.join(", "), oneOf(FACT_TYPES))
    .option("--evidence <ref...>", "what shows it: msg:, note:, meeting:, person: or another reference")
    .option("--project <ref>", "the project it belongs to, project:<id>")
    .option("--subject <ref>", "what it is about, as a reference")
    .option("--occurred <iso>", "when it happened, as the evidence shows")
    .option("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .option("--supersedes <ref>", "a decision only: the decision this one replaces")
    .option("--json", "print JSON")
    .action((words: string[], options: AddOptions) =>
      run(options.json, (store) =>
        store.facts.add({
          type: options.type,
          statement: words.join(" "),
          by: "owner",
          ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
          ...(options.project === undefined ? {} : { project: options.project }),
          ...(options.subject === undefined ? {} : { subject: options.subject }),
          ...(options.occurred === undefined ? {} : { occurredAt: options.occurred }),
          ...(options.scope === undefined ? {} : { scope: options.scope }),
          ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
        }),
      ),
    )

  facts
    .command("list")
    .description("Facts, latest first")
    .option("--type <type>", FACT_TYPES.join(", "), oneOf(FACT_TYPES))
    .option("--status <status>", FACT_STATUSES.join(", "), oneOf(FACT_STATUSES))
    .option("--project <ref>", "only this project's, project:<id>")
    .option("--subject <ref>", "only facts about this reference")
    .option("--limit <n>", "most facts, up to 500", positive, 100)
    .option("--json", "print JSON")
    .action(({ json, ...filters }: Filters) =>
      run(json, (store) => pageOf(filters.limit, (limit) => store.facts.list({ ...filters, limit }))),
    )

  facts
    .command("show")
    .description("One fact with its evidence")
    .argument("<ref>", "fact:<id>")
    .option("--json", "print JSON")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.facts.get(ref)))

  facts
    .command("accept")
    .description("Stand behind a fact an agent proposed; a decision it supersedes stops holding")
    .argument("<ref>", "fact:<id>")
    .option("--json", "print JSON")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.facts.accept(ref)))

  facts
    .command("reverse")
    .description("An accepted decision no longer holds, and nothing replaced it")
    .argument("<ref>", "fact:<id>")
    .option("--json", "print JSON")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.facts.reverse(ref)))
}
