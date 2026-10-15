import { CliError, type Streams } from "@wirecat/cli-base"
import { withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, VocabularyKind, VocabularyOptions, VocabularyTarget } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { oneOf, positive } from "../options.js"
import { VOCABULARY_QUERY, vocabularyFilter } from "./list.js"

const kinds = ["project", "tag", "topic"] as const
const targetOf = (reference: string): VocabularyTarget => {
  const match = reference.match(/^(project|tag|topic):([1-9]\d*)$/)
  if (!match) throw new CliError("validation_error", "choose project:<id>, tag:<id> or topic:<id> from vocabulary list")
  return { kind: match[1] as VocabularyKind, id: match[2] as string }
}
type Options = VocabularyOptions & { json?: boolean; fingerprint?: string }

export const vocabularyCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const vocabulary = program
    .command("vocabulary")
    .description("canonical projects, tags and topics with explicit aliases")
  const { run } = answers(program, streams, env)
  const execute = (options: Options, work: (store: MessageStore) => Promise<unknown>) =>
    run(options.json, async (store) => itemAnswer(await work(store)))
  const budgetOptions = (command: Command) =>
    command
      .option("--max-entries <n>", "catalog input budget, not a page size", positive)
      .option("--max-read-bytes <bytes>", "catalog input byte budget", positive)
      .option("--json", "print JSON; --json=id,title keeps only those fields")
  const readOptions = (command: Command) =>
    budgetOptions(
      command
        .option("--kind <kind>", "project, tag or topic", oneOf(kinds))
        .option("--scope <scope>", "personal or work projects", oneOf(["personal", "work"] as const)),
    )
  const catalogOptions = (options: Options): VocabularyOptions => ({
    ...(options.kind === undefined ? {} : { kind: options.kind }),
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
    ...(options.maxReadBytes === undefined ? {} : { maxReadBytes: options.maxReadBytes }),
  })
  budgetOptions(
    withQuery(
      vocabulary.command("list").description("list canonical IDs, aliases, usage counts and a preview fingerprint"),
      VOCABULARY_QUERY,
    ),
  ).action((words: string[], options: Options) =>
    execute(options, (store) =>
      store.knowledge.vocabulary({ ...catalogOptions(options), ...vocabularyFilter(words, "vocabulary list") }),
    ),
  )
  readOptions(
    vocabulary
      .command("show")
      .argument("<name>", "the name or alias to look up, exactly")
      .description("the project, tag or topic an exact name or alias names; ambiguity is reported"),
  ).action((name: string, options: Options) =>
    execute(options, (store) => store.knowledge.resolveVocabulary(name, catalogOptions(options))),
  )
  readOptions(
    vocabulary
      .command("check")
      .argument("[name]", "a tag or topic you mean to create; without it, the whole vocabulary")
      .summary("check a new name for existing labels, or the vocabulary for likely synonyms")
      .description(
        "check a new name for an existing label or likely duplicates before vocabulary create, or without a name " +
          "the whole vocabulary for likely synonyms. It merges and creates nothing",
      ),
  )
    .option("--min-similarity <n>", "without a name: minimum lexical similarity, 0.65–1", Number)
    .option("--max-comparisons <n>", "without a name: most name comparisons", positive)
    .option("--limit <n>", "without a name: most candidate pairs", positive)
    .action(
      (
        name: string | undefined,
        options: Options & { minSimilarity?: number; maxComparisons?: number; limit?: number },
      ) =>
        execute(options, (store) => {
          if (name === undefined)
            return store.knowledge.auditVocabulary({
              ...catalogOptions(options),
              ...(options.minSimilarity === undefined ? {} : { minSimilarity: options.minSimilarity }),
              ...(options.maxComparisons === undefined ? {} : { maxComparisons: options.maxComparisons }),
              ...(options.limit === undefined ? {} : { limit: options.limit }),
            })
          if (options.kind === "project" || options.scope !== undefined)
            throw new CliError(
              "validation_error",
              "a new name is a tag or topic: --kind tag or --kind topic, no --scope",
            )
          if (
            options.minSimilarity !== undefined ||
            options.maxComparisons !== undefined ||
            options.limit !== undefined
          )
            throw new CliError(
              "validation_error",
              "--min-similarity, --max-comparisons and --limit check the whole vocabulary: leave out the name",
            )
          return store.knowledge.tagPreflight(name, {
            ...(options.kind === undefined ? {} : { kind: options.kind }),
            ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
            ...(options.maxReadBytes === undefined ? {} : { maxReadBytes: options.maxReadBytes }),
          })
        }),
    )
  vocabulary
    .command("create")
    .argument("<name>", "the new tag or topic")
    .description("owner: create a distinct tag or topic after vocabulary check <name>")
    .option("--kind <kind>", "tag or topic", oneOf(["tag", "topic"] as const))
    .requiredOption("--fingerprint <hash>", "the creation_fingerprint vocabulary check <name> gave")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((name: string, options: Options & { kind?: "tag" | "topic" }) =>
      execute(options, (store) =>
        store.knowledge.createTag(name, {
          by: "owner",
          ...(options.kind === undefined ? {} : { kind: options.kind }),
          expectedCreationFingerprint: options.fingerprint,
        }),
      ),
    )
  const aliases = vocabulary.command("aliases").description("owner-reviewed aliases on stable canonical IDs")
  aliases
    .command("add")
    .description("owner: add another name for a project, tag or topic")
    .argument("<reference>", "project:<id>, tag:<id> or topic:<id>, from vocabulary list")
    .argument("<name>", "the other name")
    .requiredOption("--fingerprint <hash>", "the current vocabulary preview fingerprint")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((reference: string, name: string, options: Options) => {
      const target = targetOf(reference)
      return execute(options, (store) =>
        store.knowledge.addVocabularyAlias(target, name, { by: "owner", expectedFingerprint: options.fingerprint }),
      )
    })
  aliases
    .command("remove")
    .description("owner: remove another name from a project, tag or topic")
    .argument("<reference>", "project:<id>, tag:<id> or topic:<id>, from vocabulary list")
    .argument("<alias-id>", "the alias's id, from vocabulary list")
    .requiredOption("--fingerprint <hash>", "the current vocabulary preview fingerprint")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((reference: string, aliasId: string, options: Options) => {
      const target = targetOf(reference)
      return execute(options, (store) =>
        store.knowledge.removeVocabularyAlias(target, aliasId, {
          by: "owner",
          expectedFingerprint: options.fingerprint,
        }),
      )
    })
}
