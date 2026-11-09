import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, withQuery } from "@wirecat/cli-core/cli"
import { type Decider, MEMORY_KINDS, MEMORY_SCOPES, type Memory, type MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, deciderOf, reasonOption, whoRuns } from "../author.js"
import { oneOf, positive } from "../options.js"
import { decideOne } from "../review/review.js"
import { sourcesIn, stripped } from "../store/guard.js"
import { canonicalProject } from "../vocabulary/project.js"
import { addMemory } from "./memories.js"
import { listMemories, MEMORY_QUERY, memoryItem, searchMemories } from "./memory.js"
import { challengeCommand, explainQuote, quotedEvidence, quoteOption, sourceCheckCommand } from "./sources.js"

export const memoriesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const memories = program
    .command("memories")
    .description("what agents and you concluded, with evidence; you confirm an agent's")

  quoteOption(
    byOption(
      annotate(memories.command("add"), {
        effects: LOCAL_WRITE,
        output: { entity: "memory" },
        literal_after_dashes: true,
      }).description("write a memory; an agent's waits as proposed until you confirm it"),
    ),
  )
    .argument("<text...>", "what is true, in a sentence or two")
    .requiredOption("--kind <kind>", MEMORY_KINDS.join(", "), oneOf(MEMORY_KINDS))
    .requiredOption("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .requiredOption("--evidence <ref...>", "what shows it: msg:, note:, meeting:, person: or another reference")
    .option("--subject <ref>", "what it is about, as a reference")
    .option("--project <project>", "the project it belongs to: its key or project:<id>")
    .option(
      "--supersedes <ref>",
      "the memory this one corrects, superseded once this one is confirmed; an agent's waits until you confirm it",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      (
        words: string[],
        options: {
          kind: Memory["kind"]
          scope: Memory["scope"]
          evidence: string[]
          subject?: string
          project?: string
          supersedes?: string
          quote?: string[]
          asOwner?: boolean
          json?: boolean
        },
        command: Command,
      ) => {
        const evidence = quotedEvidence(options.evidence, options.quote)
        const by = whoRuns(command, env, { asOwner: options.asOwner, question: "record this memory as yours?" })
        return run(options.json, async (store) =>
          itemAnswer(
            memoryItem(
              await addMemory(
                store,
                {
                  text: words.join(" "),
                  kind: options.kind,
                  scope: options.scope,
                  evidence,
                  ...(options.subject === undefined ? {} : { subject: options.subject }),
                  ...(options.project === undefined ? {} : { project: options.project }),
                  ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
                },
                await by,
              ).catch(explainQuote),
            ),
          ),
        )
      },
    )

  withQuery(
    annotate(memories.command("list"), { effects: LOCAL_READ }).description("memories, newest first"),
    MEMORY_QUERY,
  )
    .option("--limit <n>", "most memories, up to 500", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, async (store) => stripped(store, env, await listMemories(store, words, limit))),
    )

  annotate(memories.command("show"), { effects: LOCAL_READ, output: { entity: "memory" } })
    .description("one memory with its evidence")
    .argument("<ref>", "memory:<id>")
    .option("--sources", "read each piece of evidence back: who, when, a short excerpt, and whether it is gone")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { sources?: boolean; json?: boolean }) =>
      run(options.json, async (store) =>
        itemAnswer(
          await stripped(store, env, {
            ...memoryItem(await store.memories.get(ref)),
            ...(options.sources ? await sourcesIn(store, env, await store.memories.sources(ref)) : {}),
          }),
        ),
      ),
    )

  annotate(memories.command("update"), { effects: LOCAL_WRITE, output: { entity: "memory" } })
    .description("move a memory to another project, or to none")
    .argument("<ref>", "memory:<id>")
    .requiredOption("--project <project>", "the project's key or project:<id>; none takes it out of its project")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { project: string; json?: boolean }) =>
      run(options.json, async (store) =>
        itemAnswer(
          memoryItem(
            await store.memories.update(ref, {
              project: options.project === "none" ? null : await canonicalProject(store, options.project),
            }),
          ),
        ),
      ),
    )

  const decide = (
    name: "confirm" | "invalidate" | "remove",
    description: string,
    act: (store: MessageStore, ref: string, by: Decider) => Promise<unknown>,
  ) =>
    reasonOption(
      byOption(
        annotate(memories.command(name), {
          effects: LOCAL_WRITE,
          ...(name === "remove" ? {} : { output: { entity: "memory" } }),
        }),
      )
        .description(description)
        .argument("<ref>", "memory:<id>")
        .option("--json", "print JSON; --json=id,title keeps only those fields"),
    ).action(async (ref: string, options: { reason?: string; asOwner?: boolean; json?: boolean }, command: Command) => {
      await run(options.json, async (store) => {
        // An unknown ref is not_found for anyone, before asking who decides.
        await store.memories.get(ref)
        const by = await deciderOf(command, env, { ...options, question: `${name} ${ref} as you, the owner?` })
        const done = await act(store, ref, by)
        return itemAnswer(name === "remove" ? done : memoryItem(done as Memory))
      })
    })

  // A proposed memory is decided through the review registry; a confirmed one is checked again or marked stale.
  const decided = async (store: MessageStore, ref: string, by: Decider, confirm: boolean) => {
    if ((await store.memories.get(ref)).status !== "proposed")
      return confirm ? store.memories.confirm(ref, by) : store.memories.markStale(ref, by)
    await decideOne(store, env, ref, { confirm, by })
    return store.memories.get(ref)
  }
  decide("confirm", "stand behind a memory: its evidence was checked now", (store, ref, by) =>
    decided(store, ref, by, true),
  )
  decide("invalidate", "mark a memory whose evidence no longer holds", (store, ref, by) =>
    decided(store, ref, by, false),
  )
  decide("remove", "forget a memory: erase its text, its links to sources and its search entry", (store, ref, by) =>
    store.memories.remove(ref, by),
  ).addHelpText("after", `\n${FORGET_HELP}`)

  sourceCheckCommand(memories, streams, env)
  challengeCommand(memories, "memory", streams, env)
}

/** What Forget leaves behind, said where the owner decides (NEED-169). */
export const FORGET_HELP =
  "The messages, notes and meetings it cites stay. A store backup made before keeps it, until that backup is " +
  "deleted. To keep a record of the mistake, use invalidate, or add the right one with --supersedes instead."

export const searchMemoriesCommand = (search: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(search, streams, env)
  annotate(search.command("memories"), { effects: LOCAL_READ, output: { entity: "memory" } })
    .description("memories holding every word, best first")
    .argument("<query...>", "the words to find; scope:personal or scope:work narrows them")
    .option("--limit <n>", "most memories, up to 500", positive, 20)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { limit: number; json?: boolean }) =>
      run(options.json, (store) => searchMemories(store, words, options.limit)),
    )
}
