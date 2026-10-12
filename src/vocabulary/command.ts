import { CliError, type Streams } from "@wirecat/cli-base"
import type { MessageStore, VocabularyKind, VocabularyOptions, VocabularyTarget } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { oneOf, positive } from "../options.js"
import { answering } from "../records/run.js"

const kinds = ["project", "tag", "topic"] as const
const targetOf = (reference: string): VocabularyTarget => {
  const match = reference.match(/^(project|tag|topic):([1-9]\d*)$/)
  if (!match) throw new CliError("validation_error", "choose project:<id>, tag:<id> or topic:<id> from vocabulary list")
  return { kind: match[1] as VocabularyKind, id: match[2] as string }
}
type Options = VocabularyOptions & { json?: boolean; expected?: string }

export const vocabularyCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const vocabulary = program
    .command("vocabulary")
    .description("Canonical projects, tags and topics with explicit aliases")
  const run = answering(streams, env)
  const execute = (options: Options, work: (store: MessageStore) => Promise<unknown>) => run(options.json, work)
  const readOptions = (command: Command) =>
    command
      .option("--kind <kind>", "project, tag or topic", oneOf(kinds))
      .option("--scope <scope>", "personal or work projects", oneOf(["personal", "work"] as const))
      .option("--max-entries <n>", "catalog input budget, not a page size", positive)
      .option("--max-read-bytes <n>", "catalog input byte budget", positive)
      .option("--json", "print JSON")
  const catalogOptions = (options: Options): VocabularyOptions => ({
    ...(options.kind === undefined ? {} : { kind: options.kind }),
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
    ...(options.maxReadBytes === undefined ? {} : { maxReadBytes: options.maxReadBytes }),
  })
  readOptions(
    vocabulary.command("list").description("List canonical IDs, aliases, usage counts and a preview fingerprint"),
  ).action((options: Options) => execute(options, (store) => store.knowledge.vocabulary(catalogOptions(options))))
  readOptions(
    vocabulary
      .command("resolve")
      .argument("<name>")
      .description("Resolve an exact name or alias; ambiguity is reported"),
  ).action((name: string, options: Options) =>
    execute(options, (store) => store.knowledge.resolveVocabulary(name, catalogOptions(options))),
  )
  readOptions(vocabulary.command("audit").description("Discover likely synonyms without accepting or merging them"))
    .option("--min-similarity <n>", "minimum lexical similarity, 0.65–1", Number)
    .option("--max-comparisons <n>", "bound name comparisons", positive)
    .option("--limit <n>", "maximum candidate pairs", positive)
    .action((options: Options & { minSimilarity?: number; maxComparisons?: number; limit?: number }) =>
      execute(options, (store) =>
        store.knowledge.auditVocabulary({
          ...catalogOptions(options),
          ...(options.minSimilarity === undefined ? {} : { minSimilarity: options.minSimilarity }),
          ...(options.maxComparisons === undefined ? {} : { maxComparisons: options.maxComparisons }),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        }),
      ),
    )
  vocabulary
    .command("preflight")
    .argument("<name>")
    .description("Review an existing label or likely lexical duplicates before creation")
    .option("--kind <kind>", "tag or topic", oneOf(["tag", "topic"] as const))
    .option("--json", "print JSON")
    .action((name: string, options: Options & { kind?: "tag" | "topic" }) =>
      execute(options, (store) =>
        store.knowledge.tagPreflight(name, { ...(options.kind === undefined ? {} : { kind: options.kind }) }),
      ),
    )
  vocabulary
    .command("create")
    .argument("<name>")
    .description("Owner: create a distinct tag or topic after reviewing its preflight")
    .option("--kind <kind>", "tag or topic", oneOf(["tag", "topic"] as const))
    .requiredOption("--expected <fingerprint>", "the current preflight creationFingerprint")
    .option("--json", "print JSON")
    .action((name: string, options: Options & { kind?: "tag" | "topic" }) =>
      execute(options, (store) =>
        store.knowledge.createTag(name, {
          by: "owner",
          ...(options.kind === undefined ? {} : { kind: options.kind }),
          expectedCreationFingerprint: options.expected,
        }),
      ),
    )
  const aliases = vocabulary.command("aliases").description("Owner-reviewed aliases on stable canonical IDs")
  aliases
    .command("add")
    .description("Owner: add another name for a project, tag or topic")
    .argument("<reference>")
    .argument("<name>")
    .requiredOption("--expected <fingerprint>", "the current vocabulary preview fingerprint")
    .option("--json", "print JSON")
    .action((reference: string, name: string, options: Options) => {
      const target = targetOf(reference)
      return execute(options, (store) =>
        store.knowledge.addVocabularyAlias(target, name, { by: "owner", expectedFingerprint: options.expected }),
      )
    })
  aliases
    .command("remove")
    .description("Owner: remove another name from a project, tag or topic")
    .argument("<reference>")
    .argument("<alias-id>")
    .requiredOption("--expected <fingerprint>", "the current vocabulary preview fingerprint")
    .option("--json", "print JSON")
    .action((reference: string, aliasId: string, options: Options) => {
      const target = targetOf(reference)
      return execute(options, (store) =>
        store.knowledge.removeVocabularyAlias(target, aliasId, { by: "owner", expectedFingerprint: options.expected }),
      )
    })
}
