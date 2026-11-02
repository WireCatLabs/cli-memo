import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, withQuery } from "@wirecat/cli-core/cli"
import { type Decider, FACT_TYPES, type Fact, MEMORY_SCOPES, type MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, deciderOf, reasonOption, whoRuns } from "../author.js"
import { FORGET_HELP } from "../memories/command.js"
import { oneOf, positive } from "../options.js"
import { decideOne, decisionOf } from "../review/review.js"
import { canonicalProject } from "../vocabulary/project.js"
import { FACT_QUERY, factItem, listFacts } from "./fact.js"
import { addFact } from "./facts.js"

interface AddOptions {
  kind: Fact["type"]
  evidence?: string[]
  project?: string
  subject?: string
  occurredTime?: string
  scope?: (typeof MEMORY_SCOPES)[number]
  supersedes?: string
  asOwner?: boolean
  json?: boolean
}

export const factsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const facts = program.command("facts").description("what happened — said, asked, decided, promised — with evidence")

  byOption(
    annotate(facts.command("add"), {
      effects: LOCAL_WRITE,
      output: { entity: "fact" },
      literal_after_dashes: true,
    }).description("record a fact; an agent's waits as proposed until you confirm it"),
  )
    .argument("<statement...>", "what happened, in one sentence")
    .requiredOption("--kind <kind>", FACT_TYPES.join(", "), oneOf(FACT_TYPES))
    .option("--evidence <ref...>", "what shows it: msg:, note:, meeting:, person: or another reference")
    .option("--project <project>", "the project it belongs to: its key or project:<id>")
    .option("--subject <ref>", "what it is about, as a reference")
    .option("--occurred-time <time>", "when it happened, as the evidence shows, ISO 8601")
    .option("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .option(
      "--supersedes <ref>",
      "the proposed or accepted fact this one corrects; it stays, marked superseded once this one is accepted",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: AddOptions, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "record this fact as yours?" })
      await run(options.json, async (store) =>
        itemAnswer(
          factItem(
            await addFact(store, {
              type: options.kind,
              statement: words.join(" "),
              by,
              ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
              ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
              ...(options.subject === undefined ? {} : { subject: options.subject }),
              ...(options.occurredTime === undefined ? {} : { occurredAt: options.occurredTime }),
              ...(options.scope === undefined ? {} : { scope: options.scope }),
              ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
            }),
          ),
        ),
      )
    })

  withQuery(annotate(facts.command("list"), { effects: LOCAL_READ }).description("facts, latest first"), FACT_QUERY)
    .option("--limit <n>", "most facts, up to 500", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listFacts(store, words, limit)),
    )

  annotate(facts.command("show"), { effects: LOCAL_READ, output: { entity: "fact" } })
    .description("one fact with its evidence")
    .argument("<ref>", "fact:<id>")
    .option("--sources", "read each piece of evidence back: who, when, a short excerpt, and whether it is gone")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { sources?: boolean; json?: boolean }) =>
      run(options.json, async (store) =>
        itemAnswer({
          ...factItem(await store.facts.get(ref)),
          ...(options.sources ? { sources: await store.facts.sources(ref) } : {}),
        }),
      ),
    )

  const decide = (
    name: "confirm" | "reverse" | "reject" | "remove",
    description: string,
    act: (store: MessageStore, ref: string, by: Decider, reason?: string) => Promise<unknown>,
  ) =>
    reasonOption(
      byOption(
        annotate(facts.command(name), {
          effects: LOCAL_WRITE,
          ...(name === "remove" ? {} : { output: { entity: "fact" } }),
        }),
      )
        .description(description)
        .argument("<ref>", "fact:<id>")
        .option("--json", "print JSON; --json=id,title keeps only those fields"),
    ).action(async (ref: string, options: Decision, command: Command) => {
      await run(options.json, async (store) => {
        // An unknown ref is not_found for anyone, before asking who decides.
        await store.facts.get(ref)
        const by = await deciderOf(command, env, { ...options, question: `${name} ${ref} as you, the owner?` })
        const done = await act(store, ref, by, options.reason)
        return itemAnswer(name === "remove" ? done : factItem(done as Fact))
      })
    })

  decide(
    "confirm",
    "stand behind a fact an agent proposed; a fact it supersedes stops holding. memo review confirm decides many",
    async (store, ref, by, why) => {
      await decideOne(store, ref, decisionOf(true, by, why))
      return store.facts.get(ref)
    },
  ).summary("stand behind a fact an agent proposed")
  decide("reverse", "an accepted decision no longer holds, and nothing replaced it", (store, ref, by) =>
    store.facts.reverse(ref, by),
  )
  decide("reject", "turn down a fact an agent proposed; it stays, marked rejected", async (store, ref, by, why) => {
    await decideOne(store, ref, decisionOf(false, by, why))
    return store.facts.get(ref)
  })
  decide("remove", "forget a fact: erase its text, its links to sources and its tags", (store, ref, by) =>
    store.facts.remove(ref, by),
  ).addHelpText("after", `\n${FORGET_HELP.replace("use invalidate", "use reject or reverse")}`)
}

interface Decision {
  reason?: string
  asOwner?: boolean
  json?: boolean
}
