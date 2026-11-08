import { CliError, isCliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { answerEntity, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { EvidenceInput, MessageStore, SourceCheck } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import * as v from "valibot"
import { answers, itemAnswer, withStore } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { sinceOf } from "../digest/command.js"
import { positive } from "../options.js"
import { REVIEW_SOURCES, reviewOf } from "../review/review.js"

export const QUOTE_HELP =
  "the words an --evidence reference says that this rests on, as <ref>=<words>, one per reference. A later check " +
  "raises nothing while the source still says them"

export const quoteOption = (command: Command) => command.option("--quote <ref=words...>", QUOTE_HELP)

/**
 * Pairs each `--quote` with its `--evidence` reference. The reference is matched as a prefix, longest first, because a
 * reference or a quote may itself hold `=`.
 */
export const quotedEvidence = (evidence: readonly string[], quotes: readonly string[] = []): EvidenceInput[] => {
  const longestFirst = [...evidence].sort((a, b) => b.length - a.length)
  const quoteOf = new Map<string, string>()
  for (const given of quotes) {
    const ref = longestFirst.find((one) => given.startsWith(`${one}=`))
    const words = ref === undefined ? "" : given.slice(ref.length + 1).trim()
    if (ref === undefined || !words)
      throw new CliError(
        "validation_error",
        `--quote ${given.slice(0, 60)} names none of the --evidence references; write it as <ref>=<the words>`,
        { reason: "evidence.quote-unmatched", param: "quote" },
      )
    if (quoteOf.has(ref))
      throw new CliError("validation_error", `${ref} has two --quote values; give one quote per reference`, {
        reason: "evidence.quote-unmatched",
        param: "quote",
      })
    quoteOf.set(ref, words)
  }
  return evidence.map((ref) => {
    const quote = quoteOf.get(ref)
    return quote === undefined ? ref : { ref, quote }
  })
}

/** The store's refusal names the reference; the reader also needs what to do about it. */
export const explainQuote = (error: unknown): never => {
  if (isCliError(error) && error.details.reason === "evidence.quote-not-found")
    throw new CliError(
      "validation_error",
      `${error.message}: quote the words exactly as the source has them (memo show <ref> reads it), or leave --quote out`,
      { reason: "evidence.quote-not-found", param: "quote" },
    )
  throw error
}

export const SOURCE_CHECK = v.strictObject({
  checked: v.number(),
  baselined: v.number(),
  raised: v.number(),
  refreshed: v.number(),
  closed: v.number(),
  changed_refs: v.array(v.string()),
})

export const sourceCheckText = (check: SourceCheck) =>
  [
    `${check.checked} sources checked: ${check.raised} raised for review, ${check.refreshed} changed but still say ` +
      `the quoted words, ${check.baselined} signed for the first time, ${check.closed} reviews closed`,
    ...(check.raised > 0 ? [`next: ${REVIEW_SOURCES}`] : []),
    ...(check.changedRefs.length > 0
      ? [`${check.changedRefs.length} changed sources no findings batch reads yet: ${check.changedRefs.join(" ")}`]
      : []),
  ].join("\n")

/** `memories check`: anyone may run it, since it only signs links and opens reviews for the owner. */
export const sourceCheckCommand = (memories: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(memories, streams, env)
  answerEntity(annotate(memories.command("check"), { effects: LOCAL_WRITE }), "source_check", SOURCE_CHECK)
    .summary("look again at what memories and facts cite; raise a review where it changed")
    .description(
      "compare what memories and facts cite with the sources now, least recently checked first: a changed source " +
        "that still says the quoted words is signed again; one that changed, went or was replaced raises a " +
        "memory_source_review for you to decide. Status never changes here. changed_refs lists changed sources no " +
        "findings batch reads yet, for an agent to read again with projects actions add; a run names a change " +
        "once, so --since-time also lists those an earlier run, such as memo sync's, already found. memo sync runs it too",
    )
    .option("--limit <n>", "most evidence links this run, up to 10000", positive, 500)
    .option(
      "--since-time <time>",
      "changed_refs also lists sources earlier runs found changed since then: 12h, 7d or a date (2026-11-01)",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { limit: number; sinceTime?: string; json?: boolean }) => {
      const since = options.sinceTime === undefined ? undefined : sinceOf(options.sinceTime)
      const check = await withStore(env, async (store) => {
        const found = await store.knowledge.checkSources({ limit: options.limit })
        if (since === undefined) return found
        const earlier = await store.knowledge.changedSources({ since, limit: options.limit })
        return { ...found, changedRefs: [...new Set([...found.changedRefs, ...earlier.map(({ ref }) => ref)])] }
      })
      print(options.json, itemAnswer(check), sourceCheckText(check))
    })
}

const TARGET = { memory: "memory:<id>", fact: "fact:<id>" } as const

/** `memories challenge` and `facts challenge`: a contradiction opens the owner's review and decides nothing. */
export const challengeCommand = (
  parent: Command,
  type: "memory" | "fact",
  streams: Streams,
  env: NodeJS.ProcessEnv,
): void => {
  const { run } = answers(parent, streams, env)
  byOption(annotate(parent.command("challenge"), { effects: LOCAL_WRITE }))
    .summary(`say a ${type} no longer holds, citing what contradicts it; you decide`)
    .description(
      `say a ${type} is contradicted, citing what shows it: this opens its memory_source_review, or adds to the ` +
        "open one, and changes nothing else. Only you decide it (memo review show <id>). An agent may run it",
    )
    .argument("<ref>", TARGET[type])
    .requiredOption("--evidence <ref...>", "what contradicts it: msg:, note:, meeting:, fact: or another reference")
    .requiredOption("--reason <text>", "why it no longer holds, in a sentence")
    .option("--suggest <text>", `what the ${type} should say instead, for you to take or leave`)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        ref: string,
        options: { evidence: string[]; reason: string; suggest?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `challenge ${ref} as you?` })
        await run(options.json, async (store: MessageStore) => {
          await (type === "memory" ? store.memories.get(ref) : store.facts.get(ref))
          const proposal = await store.knowledge.challenge(ref, {
            evidence: options.evidence,
            reason: options.reason,
            by,
            ...(options.suggest === undefined ? {} : { suggestion: options.suggest }),
          })
          return itemAnswer(await reviewOf(store, proposal.id))
        })
      },
    )
}
