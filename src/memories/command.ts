import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ, LOCAL_WRITE, withQuery } from "@wirecat/cli-core/cli"
import { MEMORY_KINDS, MEMORY_SCOPES, type Memory } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { authorOf, byOption } from "../author.js"
import { oneOf, positive } from "../options.js"
import { addMemory } from "./memories.js"
import { listMemories, MEMORY_QUERY, memoryItem, searchMemories } from "./memory.js"

export const memoriesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const memories = program
    .command("memories")
    .description("what agents and you concluded, with evidence; you confirm an agent's")

  byOption(
    annotate(memories.command("add"), { effects: LOCAL_WRITE, output: { entity: "memory" } }).description(
      "write a memory; an agent's waits as proposed until you confirm it",
    ),
  )
    .argument("<text...>", "what is true, in a sentence or two")
    .requiredOption("--kind <kind>", MEMORY_KINDS.join(", "), oneOf(MEMORY_KINDS))
    .requiredOption("--scope <scope>", MEMORY_SCOPES.join(" or "), oneOf(MEMORY_SCOPES))
    .requiredOption("--evidence <ref...>", "what shows it: msg:, note:, meeting:, person: or another reference")
    .option("--subject <ref>", "what it is about, as a reference")
    .option("--supersedes <ref>", "yours only: the memory this one corrects; it stays, marked superseded")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      (
        words: string[],
        options: {
          kind: Memory["kind"]
          scope: Memory["scope"]
          evidence: string[]
          subject?: string
          supersedes?: string
          asOwner?: boolean
          json?: boolean
        },
      ) =>
        run(options.json, async (store) =>
          itemAnswer(
            memoryItem(
              await addMemory(
                store,
                {
                  text: words.join(" "),
                  kind: options.kind,
                  scope: options.scope,
                  evidence: options.evidence,
                  ...(options.subject === undefined ? {} : { subject: options.subject }),
                  ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
                },
                authorOf(env, options.asOwner),
              ),
            ),
          ),
        ),
    )

  withQuery(
    annotate(memories.command("list"), { effects: LOCAL_READ }).description("memories, newest first"),
    MEMORY_QUERY,
  )
    .option("--limit <n>", "most memories, up to 500", positive, 100)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listMemories(store, words, limit)),
    )

  annotate(memories.command("show"), { effects: LOCAL_READ, output: { entity: "memory" } })
    .description("one memory with its evidence")
    .argument("<ref>", "memory:<id>")
    .option("--sources", "read each piece of evidence back: who, when, a short excerpt, and whether it is gone")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { sources?: boolean; json?: boolean }) =>
      run(options.json, async (store) =>
        itemAnswer({
          ...memoryItem(await store.memories.get(ref)),
          ...(options.sources ? { sources: await store.memories.sources(ref) } : {}),
        }),
      ),
    )

  annotate(memories.command("confirm"), { effects: LOCAL_WRITE, output: { entity: "memory" } })
    .description("stand behind a memory: its evidence was checked now")
    .argument("<ref>", "memory:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(memoryItem(await store.memories.confirm(ref)))),
    )

  annotate(memories.command("invalidate"), { effects: LOCAL_WRITE, output: { entity: "memory" } })
    .description("mark a memory whose evidence no longer holds")
    .argument("<ref>", "memory:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(memoryItem(await store.memories.markStale(ref)))),
    )

  annotate(memories.command("remove"), { effects: LOCAL_WRITE })
    .description("forget a memory: erase its text, its links to sources and its search entry")
    .argument("<ref>", "memory:<id>")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText("after", `\n${FORGET_HELP}`)
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.memories.remove(ref))),
    )
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
