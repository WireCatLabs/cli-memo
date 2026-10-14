import type { Streams } from "@wirecat/cli-base"
import { FACT_STATUSES, FACT_TYPES, type Fact, MEMORY_SCOPES } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { authorOf, byOption } from "../author.js"
import { oneOf, positive } from "../options.js"
import { pageOf } from "../page.js"
import { answering } from "../records/run.js"
import { canonicalProject } from "../vocabulary/project.js"

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
  asOwner?: boolean
  json?: boolean
}

export const factsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const run = answering(streams, env)
  const facts = program.command("facts").description("what happened — said, asked, decided, promised — with evidence")

  byOption(facts.command("add").description("record a fact; an agent's waits as proposed until you confirm it"))
    .argument("<statement...>", "what happened, in one sentence")
    .requiredOption("--type <type>", FACT_TYPES.join(", "), oneOf(FACT_TYPES))
    .option("--evidence <ref...>", "what shows it: msg:, note:, meeting:, person: or another reference")
    .option("--project <project>", "the project it belongs to: its key or project:<id>")
    .option("--subject <ref>", "what it is about, as a reference")
    .option("--occurred <iso>", "when it happened, as the evidence shows")
    .option("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .option("--supersedes <ref>", "a decision only: the decision this one replaces")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: AddOptions) =>
      run(options.json, async (store) =>
        store.facts.add({
          type: options.type,
          statement: words.join(" "),
          by: authorOf(env, options.asOwner),
          ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
          ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
          ...(options.subject === undefined ? {} : { subject: options.subject }),
          ...(options.occurred === undefined ? {} : { occurredAt: options.occurred }),
          ...(options.scope === undefined ? {} : { scope: options.scope }),
          ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
        }),
      ),
    )

  facts
    .command("list")
    .description("facts, latest first")
    .option("--type <type>", FACT_TYPES.join(", "), oneOf(FACT_TYPES))
    .option("--status <status>", FACT_STATUSES.join(", "), oneOf(FACT_STATUSES))
    .option("--project <project>", "only this project's: its key or project:<id>")
    .option("--subject <ref>", "only facts about this reference")
    .option("--limit <n>", "most facts, up to 500", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(({ json, ...filters }: Filters) =>
      run(json, async (store) => {
        const project = filters.project === undefined ? undefined : await canonicalProject(store, filters.project)
        return pageOf(filters.limit, (limit) =>
          store.facts.list({ ...filters, ...(project === undefined ? {} : { project }), limit }),
        )
      }),
    )

  facts
    .command("show")
    .description("one fact with its evidence")
    .argument("<ref>", "fact:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.facts.get(ref)))

  facts
    .command("confirm")
    .description("stand behind a fact an agent proposed; a decision it supersedes stops holding")
    .argument("<ref>", "fact:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.facts.accept(ref)))

  facts
    .command("reverse")
    .description("an accepted decision no longer holds, and nothing replaced it")
    .argument("<ref>", "fact:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { json?: boolean }) => run(options.json, (store) => store.facts.reverse(ref)))
}
