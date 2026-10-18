import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { positive } from "../options.js"
import { type TagInspectionInput, tagInspectionOptions } from "./inspection.js"

export const addVocabularyInspection = (
  parent: Command,
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
): void => {
  const { run } = answers(program, streams, env)
  annotate(parent.command("inspect"), { effects: LOCAL_READ, output: { entity: "vocabulary_inspection" } })
    .argument("<source>", "the duplicate tag:<id> to inspect, from vocabulary list")
    .argument("<survivor>", "the canonical tag:<id> you would keep; nothing is merged")
    .description(
      "preview two tags' assignments, aliases, automatic claims and links before consolidation; writes and merges nothing",
    )
    .summary("inspect two tags before consolidation, without merging them")
    .requiredOption("--fingerprint <hash>", "the current fingerprint from unfiltered vocabulary list")
    .option("--max-rows <n>", "dependency row budget, 1–20000 (default 5000)", positive)
    .option("--max-read-bytes <bytes>", "dependency byte budget, 1–16777216 (default 1048576)", positive)
    .option("--limit <n>", "samples per table, 1–100 (default 10); counts remain complete", positive)
    .option("--json", "print the standard JSON answer")
    .action(
      (
        source: string,
        survivor: string,
        options: Omit<TagInspectionInput, "source" | "survivor"> & { json?: boolean },
      ) => {
        const input = tagInspectionOptions({ source, survivor, ...options })
        return run(options.json, async (store) => itemAnswer(await store.knowledge.previewTagConsolidation(input)))
      },
    )
}
