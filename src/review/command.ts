import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { answerEntity, LOCAL_READ, LOCAL_WRITE, parseDuration, type RowShape, withQuery } from "@wirecat/cli-core/cli"
import { parseProposalIds } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import * as v from "valibot"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { byOption, deciderOf } from "../author.js"
import { evidenceContext } from "../knowledge/project-actions.js"
import { positive, whole } from "../options.js"
import { reviewRegistry } from "./kinds.js"
import {
  decidedText,
  decisionOf,
  EVIDENCE_UNTRUSTED,
  listReview,
  REVIEW_QUERY,
  reviewSteps,
  reviewText,
  senderOf,
  showReview,
} from "./review.js"
import { reviewStatus, reviewStatusText } from "./status.js"

const PROPOSAL = v.strictObject({
  id: v.string(),
  kind: v.string(),
  status: v.picklist(["proposed", "confirmed", "rejected"]),
  title: v.string(),
  project: v.nullable(v.string()),
  project_title: v.nullable(v.string()),
  source: v.nullable(v.string()),
  owner_only: v.boolean(),
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

/** A task's key has letters, which cli-core's id parser does not take: `close:Q-15` is read here. */
const CLOSE_ID = /^close:[A-Za-z][A-Za-z0-9]*-[1-9]\d*$/

export const reviewIds = (words: readonly string[]) => {
  const tokens = words.flatMap((word) => word.split(",")).map((one) => one.trim())
  const closes = tokens.filter((one) => CLOSE_ID.test(one))
  const rest = tokens.filter((one) => one !== "" && !CLOSE_ID.test(one))
  return [...new Set([...(rest.length || !closes.length ? parseProposalIds(rest) : []), ...closes])]
}

const json = (command: Command) => command.option("--json", "print JSON; --json=id,title keeps only those fields")

export const reviewCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const review = program
    .command("review")
    .description(
      "every proposal waiting for your decision, across projects: links, key documents, facts, invoices, payments and more",
    )
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
      const found = await withStore(env, (store) => listReview(store, env, words, given))
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
    .argument(
      "<id>",
      "the proposal's id, as review lists it: 17070, fact:512, memory:88, link:17, payment:4, close:Q-15",
    )
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
          const shown = await showReview(store, env, id)
          const window = {
            brief: given.brief === true,
            before: Math.min(given.beforeN, 5),
            after: Math.min(given.afterN, 5),
          }
          const evidence = await Promise.all(
            shown.evidence.map(async (one) => {
              const sender = window.brief ? null : await senderOf(store, one.ref)
              return {
                ...(window.brief ? {} : await evidenceContext(store, one.ref, null, shown.reason ?? "", window)),
                ...one,
                ...(sender === null ? {} : { sender }),
                untrusted: EVIDENCE_UNTRUSTED,
              }
            }),
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
      .argument(
        "<ids...>",
        name === "confirm"
          ? "ids or ranges as review lists them; 17080/f1 accepts that finding and rejects the batch's others"
          : "ids or ranges as review lists them; a batch is turned down whole",
      )
    if (name === "confirm") command.option("--reason <text>", "why, in a few words; required when an agent decides")
    else command.requiredOption("--reason <text>", "why it is turned down, in a few words")
    command.option("--compact", "one line per decision")
    command.action(
      async (words: string[], given: { reason?: string; asOwner?: boolean; json?: boolean; compact?: boolean }) => {
        const ids = reviewIds(words)
        const by = await deciderOf(command, env, {
          ...given,
          question: `${name} ${ids.length} proposal${ids.length === 1 ? "" : "s"} as you, the owner?`,
        })
        const result = await withStore(env, (store) =>
          reviewRegistry(store, env).decide(ids, decisionOf(name === "confirm", by, given.reason)),
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

  json(annotate(review.command("status"), { effects: LOCAL_READ, output: { entity: "review_status" } }))
    .summary("since yesterday: new mail, what is owed and waiting, what agents proposed")
    .description(
      "the owner's daily look, with no model call: per mail account the threads with new mail, what you owe and " +
        "wait for, and how far each agent's processing mark has read; then what was proposed and what waits",
    )
    .option("--since-time <time>", "how far back: hours or days (12h, 7d) or a start date (2026-11-01)", "1d")
    .action(async (given: { sinceTime: string; json?: boolean }) => {
      const since = /^\d{4}-\d{2}-\d{2}/.test(given.sinceTime)
        ? Date.parse(given.sinceTime)
        : Date.now() - parseDuration(given.sinceTime, "--since-time")
      if (Number.isNaN(since))
        throw new CliError("validation_error", `--since-time takes 12h, 7d or a date, not "${given.sinceTime}"`, {
          param: "since-time",
        })
      const status = await withStore(env, (store) => reviewStatus(store, env, since))
      print(given.json, itemAnswer(status), reviewStatusText(status))
    })
}
