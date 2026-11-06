import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { DEAL_ROLES, DEAL_STATUSES, type DealRole, FINANCE_REVIEWS } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { DealFilter, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { collect, positive } from "../options.js"
import { pageOf } from "../page.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dayOf } from "./finance.js"

export const DEAL_QUERY = {
  entity: "deal",
  backend: "native",
  fields: [
    termField("project", "kw", "project:PMED"),
    termField("status", "enum", "status:open", { values: DEAL_STATUSES }),
    termField("stage", "kw", 'stage:"Quote sent"'),
    termField("pipeline", "kw", "pipeline:Sales"),
    termField("organization", "ref", 'organization:"organization:3"'),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
  ],
} as const satisfies QueryRegistry

const PIPELINE_QUERY = {
  entity: "pipeline",
  backend: "native",
  fields: [termField("name", "kw", "name:Sales")],
} as const satisfies QueryRegistry

export const listDeals = async (store: MessageStore, words: readonly string[] | string | undefined, limit?: number) => {
  const terms = queryTerms(words, DEAL_QUERY, "deals list")
  const filter: DealFilter = {
    ...(terms.has("project") ? { project: await canonicalProject(store, terms.get("project") as string) } : {}),
    ...(terms.has("status") ? { status: terms.get("status") as DealFilter["status"] } : {}),
    ...(terms.has("stage") ? { stage: terms.get("stage") as string } : {}),
    ...(terms.has("pipeline") ? { pipeline: terms.get("pipeline") as string } : {}),
    ...(terms.has("organization") ? { organization: terms.get("organization") as string } : {}),
    ...(terms.has("review") ? { review: terms.get("review") as DealFilter["review"] } : {}),
  }
  return pageOf("deals list", limit, (most) => store.deals.list({ ...filter, limit: most }))
}

const roleOf = (role: string | undefined): DealRole => {
  const value = role ?? "contact"
  if (!(DEAL_ROLES as readonly string[]).includes(value))
    throw new CliError("validation_error", `--role is one of ${DEAL_ROLES.join(", ")}`, { param: "--role" })
  return value as DealRole
}

const referenceOf = (kind: "person" | "organization", value: string) =>
  /^\d+$/.test(value.trim()) ? `${kind}:${value.trim()}` : value.trim()

interface AddOptions {
  organization?: string
  person?: string[]
  role?: string
  due?: string
  project?: string
  reason?: string
  evidence?: string[]
  asOwner?: boolean
  json?: boolean
}

const json = (command: Command) => command.option("--json", "print JSON; --json=ref,title keeps only those fields")

/** `memo deals` and `memo pipelines`: the owner's sales pipelines and the deals in them. */
export const dealCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)

  const pipelines = program
    .command("pipelines")
    .description("your sales pipelines: the stages a deal goes through, in order")
    .summary("your sales pipelines and their stages")

  withQuery(
    json(annotate(pipelines.command("list"), { effects: LOCAL_READ })).description(
      "every pipeline with its stages in order and how many open deals stand in each",
    ),
    PIPELINE_QUERY,
  ).action((words: string[], options: { json?: boolean }) =>
    run(options.json, async (store) => {
      const name = queryTerms(words, PIPELINE_QUERY, "pipelines list").get("name")?.toLocaleLowerCase()
      const all = await store.deals.pipelines()
      return wholeList(
        "pipelines list",
        name === undefined ? all : all.filter((one) => one.name.toLocaleLowerCase() === name),
      )
    }),
  )

  json(byOption(annotate(pipelines.command("add"), { effects: LOCAL_WRITE, literal_after_dashes: true })))
    .description("make a pipeline with its stages in order; only you make one, an agent asks you to")
    .summary("make a pipeline with its stages")
    .argument("<name>", "the pipeline's name, such as Sales")
    .argument("<stage...>", "its stages in order, such as Call Quote Contract")
    .action(
      async (name: string, stages: string[], options: { asOwner?: boolean; json?: boolean }, command: Command) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `make pipeline ${name}?` })
        await run(options.json, async (store) => itemAnswer(await store.deals.addPipeline({ name, stages, by })))
      },
    )

  const deals = program
    .command("deals")
    .description("deals you hope to win: the client, the expected amount, the stage and whether it was won or lost")
    .summary("deals in your pipelines, open, won or lost")

  withQuery(
    json(annotate(deals.command("list"), { effects: LOCAL_READ })).description(
      "deals, newest first; status:open is what is still in play, review:proposed what waits for you",
    ),
    DEAL_QUERY,
  )
    .summary("deals, newest first; status:open is what is still in play")
    .option("--limit <n>", "most deals, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listDeals(store, words, limit)),
    )

  json(annotate(deals.command("show"), { effects: LOCAL_READ, output: { entity: "deal" } }))
    .description("one deal with its pipeline, stage, status, amount, the people on it and what it was read from")
    .summary("one deal with its stage, status, amount and people")
    .argument("<ref>", "deal:<id>")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.deals.get(ref))),
    )

  json(
    byOption(
      annotate(deals.command("add"), { effects: LOCAL_WRITE, output: { entity: "deal" }, literal_after_dashes: true })
        .option("--organization <organization>", "the client: organization:<id>")
        .option("--person <uid>", "a person on the deal: person:<id>; repeat for another, up to 20", collect)
        .option("--role <role>", `what those people are on it: ${DEAL_ROLES.join(", ")}; contact by default`)
        .option("--due <time>", "the day you expect it to close, such as 2026-12-01")
        .option("--project <project>", "the project it belongs to: its key or project:<id>")
        .option("--reason <text>", "why an agent proposes it, for the owner who decides")
        .option("--evidence <ref...>", "what shows it, up to 8: msg:, note:, document: or another reference"),
    ),
  )
    .description(
      "record a deal in a stage; yours is confirmed at once, an agent's waits as proposed for you in memo review",
    )
    .summary("record a deal; an agent's waits for your review")
    .argument("<title>", "what you hope to sell, such as 'Site for the clinic'")
    .argument("<stage>", "the stage it is in; Sales/Quote names the pipeline when two have that stage")
    .argument("[amount]", "the expected amount, a decimal such as 500000.00")
    .argument("[currency]", "ISO 4217, such as RUB; given with the amount")
    .action(
      async (
        title: string,
        stage: string,
        amount: string | undefined,
        currency: string | undefined,
        options: AddOptions,
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "record this deal as yours?" })
        const role = roleOf(options.role)
        const [pipeline, named] = stage.includes("/") ? stage.split("/", 2) : [undefined, stage]
        await run(options.json, async (store) => {
          const closeDate = dayOf(options.due)
          return itemAnswer(
            await store.deals.add({
              by,
              title,
              stage: named as string,
              ...(pipeline === undefined ? {} : { pipeline }),
              ...(options.organization === undefined
                ? {}
                : { organization: referenceOf("organization", options.organization) }),
              ...(options.person === undefined
                ? {}
                : { people: options.person.map((person) => ({ person: referenceOf("person", person), role })) }),
              ...(amount === undefined ? {} : { amount }),
              ...(currency === undefined ? {} : { currency }),
              ...(closeDate === undefined ? {} : { closeDate }),
              ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
              ...(by !== "owner" && options.reason !== undefined ? { reason: options.reason } : {}),
              ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
            }),
          )
        })
      },
    )

  json(byOption(annotate(deals.command("move"), { effects: LOCAL_WRITE, output: { entity: "deal" } })))
    .description("move an open deal to another stage of its pipeline; only you move one, an agent asks you to")
    .summary("move a deal to another stage")
    .argument("<ref>", "deal:<id>")
    .argument("<stage>", "a stage of the deal's pipeline")
    .action(async (ref: string, stage: string, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `move ${ref} to ${stage}?` })
      await run(options.json, async (store) => itemAnswer(await store.deals.move(ref, { stage, by })))
    })

  json(
    byOption(
      annotate(deals.command("close"), { effects: LOCAL_WRITE, output: { entity: "deal" } })
        .option("--occurred-time <time>", "the day it closed, such as 2026-11-20; today when left out")
        .option("--reason <text>", "why it was won or lost, kept with the deal"),
    ),
  )
    .description("close an open deal as won or lost; it keeps its last stage; only you close one, an agent asks you to")
    .summary("close a deal as won or lost")
    .argument("<ref>", "deal:<id>")
    .argument("<outcome>", "won or lost")
    .action(
      async (
        ref: string,
        outcome: string,
        options: { occurredTime?: string; reason?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        if (outcome !== "won" && outcome !== "lost")
          throw new CliError("validation_error", "a deal closes as won or lost", { param: "outcome" })
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `close ${ref} as ${outcome}?` })
        const date = dayOf(options.occurredTime)
        await run(options.json, async (store) =>
          itemAnswer(
            await store.deals.close(ref, {
              status: outcome,
              by,
              ...(date === undefined ? {} : { date }),
              ...(options.reason === undefined ? {} : { reason: options.reason }),
            }),
          ),
        )
      },
    )
}

/** Open deals `projects status` shows, soonest expected close first; more than this is a count. */
const STATUS_DEALS = 5

/** The open deals the owner stands behind in these projects; an agent's proposed deal counts for nothing yet. */
export const openDealsOf = async (store: MessageStore, projects: readonly string[]) => {
  const found = (
    await Promise.all(projects.map((project) => store.deals.list({ project, status: "open", review: "confirmed" })))
  ).flat()
  const sorted = found.sort(
    (a, b) => (a.closeDate ?? "9999").localeCompare(b.closeDate ?? "9999") || b.createdAt.localeCompare(a.createdAt),
  )
  return {
    deals: sorted.slice(0, STATUS_DEALS).map((deal) => ({
      ref: deal.ref,
      title: deal.title,
      stage: deal.stage,
      amount: deal.amount,
      currency: deal.currency,
      close_date: deal.closeDate,
    })),
    more: Math.max(sorted.length - STATUS_DEALS, 0),
  }
}

export type DealsBlock = Awaited<ReturnType<typeof openDealsOf>>

export const dealsText = ({ deals, more }: DealsBlock): string[] =>
  deals.length === 0
    ? []
    : [
        "open deals:",
        ...deals.map((deal) => {
          const money = deal.amount === null ? "" : `, ${deal.amount} ${deal.currency}`
          const due = deal.close_date === null ? "" : `, close ${deal.close_date}`
          return `  ${deal.ref} ${deal.title} · ${deal.stage}${money}${due}`
        }),
        ...(more > 0 ? [`  +${more} more: memo deals list status:open`] : []),
      ]
