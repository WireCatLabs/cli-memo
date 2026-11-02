import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { answerEntity, LOCAL_READ, LOCAL_WRITE, type RowShape, withQuery } from "@wirecat/cli-core/cli"
import { parseProposalIds, proposalRegistry } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import * as v from "valibot"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption, deciderOf } from "../author.js"
import { evidenceContext } from "../knowledge/project-actions.js"
import { positive, whole } from "../options.js"
import { decidedText, decisionOf, listReview, REVIEW_QUERY, reviewSteps, reviewText, showReview } from "./review.js"

const PROPOSAL = v.strictObject({
  id: v.string(),
  kind: v.string(),
  status: v.picklist(["proposed", "confirmed", "rejected"]),
  title: v.string(),
  project: v.nullable(v.string()),
  project_title: v.nullable(v.string()),
  subject: v.string(),
  object: v.nullable(v.string()),
  summary: v.nullable(v.string()),
  proposer: v.string(),
  proposed_by: v.unknown(),
  reason: v.nullable(v.string()),
  score: v.nullable(v.number()),
  signals: v.unknown(),
  evidence: v.array(v.string()),
  parts: v.unknown(),
  created_at: v.string(),
})

const ROW: RowShape = {
  columns: [
    { field: "id" },
    { field: "kind" },
    { field: "title" },
    { field: "score" },
    { field: "proposer" },
    { field: "created_at", as: "day" },
  ],
  text: ["reason"],
}

const json = (command: Command) => command.option("--json", "print JSON; --json=id,title keeps only those fields")

export const reviewCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const review = program
    .command("review")
    .description("every proposal waiting for your decision, across projects: links, key documents, facts and more")
    .summary("every proposal waiting for your decision, across projects")

  json(
    answerEntity(
      withQuery(
        annotate(review.command("list", { isDefault: true }), { effects: LOCAL_READ })
          .description(
            "what waits for the owner's decision, newest first, with titles, who proposed it, why and the evidence",
          )
          .summary("what waits for your decision, newest first, with titles and evidence"),
        REVIEW_QUERY,
      ),
      "memo_proposal",
      PROPOSAL,
      { row: ROW },
    ),
  )
    .option("--limit <n>", "proposals per page, at most 50", positive, 20)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--compact", "one line per proposal")
    .action(async (words: string[], given: { limit: number; page: number; json?: boolean; compact?: boolean }) => {
      if (given.limit > 50) throw new CliError("validation_error", "--limit is at most 50", { param: "limit" })
      const found = await withStore(env, (store) => listReview(store, words, given))
      const steps = reviewSteps(found.items)
      const body = listAnswer("review list", {
        items: found.items,
        limit: given.limit,
        page: given.page,
        has_more: found.hasMore,
        args: { query: words.join(" "), limit: given.limit },
        ...(steps.length ? { next: steps } : {}),
      })
      print(given.json, body, reviewText(found.items, found.hasMore), given.compact)
    })

  json(annotate(review.command("show"), { effects: LOCAL_READ }))
    .description("one proposal with its titles, signals and the text around each piece of evidence")
    .argument("<id>", "the proposal's id, as review lists it: 17070, fact:512, memory:88, link:17, key:9")
    .option("--brief", "only references and their titles, without excerpts or nearby text")
    .option("--before-n <n>", "messages or document paragraphs before the evidence, at most 5", whole, 2)
    .option("--after-n <n>", "messages or document paragraphs after the evidence, at most 5", whole, 2)
    .option("--compact", "one line, as review prints it")
    .action(
      async (
        id: string,
        given: { brief?: boolean; beforeN: number; afterN: number; json?: boolean; compact?: boolean },
      ) => {
        const body = await withStore(env, async (store) => {
          const shown = await showReview(store, id)
          const window = {
            brief: given.brief === true,
            before: Math.min(given.beforeN, 5),
            after: Math.min(given.afterN, 5),
          }
          const evidence = await Promise.all(
            shown.evidence.map(async (one) => ({
              ...(window.brief ? {} : await evidenceContext(store, one.ref, null, shown.reason ?? "", window)),
              ...one,
            })),
          )
          return itemAnswer({ ...shown, evidence })
        })
        print(given.json, body, undefined, given.compact)
      },
    )

  for (const name of ["confirm", "reject"] as const) {
    const command = byOption(json(annotate(review.command(name), { effects: LOCAL_WRITE })))
      .description(
        name === "confirm"
          ? "confirm proposals by id or range (17070-17079,fact:500-502,17080/f1); each is decided on its own, so a " +
              "refusal leaves the others decided. An agent decides only with --reason, never its own or a scan's"
          : "turn proposals down by id or range, with why; each is decided on its own",
      )
      .summary(
        name === "confirm" ? "confirm proposals by id or range; each on its own" : "turn proposals down, with why",
      )
      .argument("<ids...>", "ids or ranges as review lists them; a batch's findings as 17080/f1")
    if (name === "confirm") command.option("--reason <text>", "why, in a few words; required when an agent decides")
    else command.requiredOption("--reason <text>", "why it is turned down, in a few words")
    command.option("--compact", "one line per decision")
    command.action(
      async (words: string[], given: { reason?: string; asOwner?: boolean; json?: boolean; compact?: boolean }) => {
        const ids = parseProposalIds(words)
        const by = await deciderOf(command, env, {
          ...given,
          question: `${name} ${ids.length} proposal${ids.length === 1 ? "" : "s"} as you, the owner?`,
        })
        const result = await withStore(env, (store) =>
          proposalRegistry(store).decide(ids, decisionOf(name === "confirm", by, given.reason)),
        )
        const issues = result.refused.map((one) => ({
          code: one.code,
          source: one.id,
          ...(one.reason.includes(".") ? { reason: one.reason } : {}),
        }))
        print(
          given.json,
          itemAnswer(result, issues.length ? { meta: { complete: false, issues } } : undefined),
          decidedText(result),
          given.compact,
        )
      },
    )
  }
}
