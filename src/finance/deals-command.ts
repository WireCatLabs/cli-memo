import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { DEAL_KINDS, DEAL_ROLES, DEAL_STATUSES, type DealKind, type DealRole } from "@wirecat/cli-core"
import {
  LOCAL_READ,
  LOCAL_WRITE,
  queryTerms,
  storedProfilesFor,
  termField,
  withQuery,
  writesWithOf,
} from "@wirecat/cli-core/cli"
import { dealBrief, dealContext } from "@wirecat/cli-core/services"
import type { AccountKey, DealFilter, MessageStore, Pipeline, PipelineReport } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { authorOf } from "../author.js"
import { collect, positive } from "../options.js"
import { pageOf } from "../page.js"
import { deniedCrmKinds } from "../search/denied.js"
import { type GroupScope, groupScopeOf } from "../store/group.js"
import { lockedCoverage } from "../store/guard.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dealBriefText, dealText } from "./deal-text.js"
import { dayOf } from "./finance.js"

const queryOf = (entity: DealKind) =>
  ({
    entity,
    backend: "native",
    fields: [
      termField("project", "kw", "project:PMED"),
      termField("status", "enum", "status:open", { values: DEAL_STATUSES }),
      termField("stage", "kw", 'stage:"Quote sent"'),
      termField("pipeline", "kw", "pipeline:Sales"),
      termField("organization", "ref", 'organization:"organization:3"'),
    ],
  }) as const satisfies QueryRegistry

const QUERIES = { deal: queryOf("deal"), lead: queryOf("lead") }

const PIPELINE_QUERY = {
  entity: "pipeline",
  backend: "native",
  fields: [termField("kind", "enum", "kind:lead", { values: DEAL_KINDS }), termField("name", "kw", "name:Sales")],
} as const satisfies QueryRegistry

/**
 * Each CRM copy's `writes_with`: the CLI and profile that change it on its server (FIND-2416). The profiles are read
 * once per command. In a group, a profile whose account the group does not hold is never named.
 */
const withWriter = async (store: MessageStore, scope: GroupScope | undefined) => {
  const profiles = await store.accounts.profiles()
  const profilesFor = storedProfilesFor(profiles)
  const options =
    scope === undefined
      ? {}
      : {
          allowed: (tool: string, profile: string) => {
            const key = profiles[tool]?.[profile]
            return key !== undefined && scope.has(key)
          },
        }
  return <T extends { account: AccountKey | null }>(item: T) => ({
    ...item,
    writesWith: writesWithOf(item.account, profilesFor, options),
  })
}

export const listDeals = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  kind: DealKind,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const command = `${kind}s list`
  const terms = queryTerms(words, QUERIES[kind], command)
  const filter: DealFilter = {
    kind,
    ...(terms.has("project") ? { project: await canonicalProject(store, terms.get("project") as string) } : {}),
    ...(terms.has("status") ? { status: terms.get("status") as DealFilter["status"] } : {}),
    ...(terms.has("stage") ? { stage: terms.get("stage") as string } : {}),
    ...(terms.has("pipeline") ? { pipeline: terms.get("pipeline") as string } : {}),
    ...(terms.has("organization") ? { organization: terms.get("organization") as string } : {}),
  }
  const scope = await groupScopeOf(store, env)
  const writer = await withWriter(store, scope)
  return pageOf(command, limit, async (most) =>
    (
      await store.deals.list({ ...filter, ...(scope === undefined ? {} : { accounts: scope.accounts }), limit: most })
    ).map(writer),
  )
}

const roleOf = (role: string | undefined): DealRole => {
  const value = role ?? "contact"
  if (!(DEAL_ROLES as readonly string[]).includes(value))
    throw new CliError("validation_error", `--role is one of ${DEAL_ROLES.join(", ")}`, { param: "--role" })
  return value as DealRole
}

const referenceOf = (kind: "person" | "organization", value: string) =>
  /^\d+$/.test(value.trim()) ? `${kind}:${value.trim()}` : value.trim()

/** `Sales/Quote` or `pipeline:3/Quote` names the pipeline too; a bare `Quote` is found in the only one that has it. */
const stageOf = (stage: string | undefined) => {
  if (stage === undefined) return {}
  const at = stage.lastIndexOf("/")
  return at <= 0 ? { stage } : { pipeline: stage.slice(0, at), stage: stage.slice(at + 1) }
}

interface AddOptions {
  organization?: string
  person?: string[]
  role?: string
  due?: string
  project?: string
  reason?: string
  evidence?: string[]
  json?: boolean
}

const json = (command: Command) => command.option("--json", "print JSON; --json=ref,title keeps only those fields")

const WHAT = {
  deal: { one: "deal", hope: "what you hope to sell, such as 'Site for the clinic'" },
  lead: { one: "lead", hope: "who or what came in, such as 'Call from the site'" },
}

const itemCommands = (
  program: Command,
  kind: DealKind,
  { run, print }: Pick<ReturnType<typeof answers>, "run" | "print">,
  env: NodeJS.ProcessEnv,
) => {
  const { one, hope } = WHAT[kind]
  const group = program
    .command(`${kind}s`)
    .description(
      kind === "deal"
        ? "deals you hope to win: the client, the expected amount, the stage and whether it was won or lost"
        : "leads: first contacts in a lead pipeline, before they are deals",
    )
    .summary(kind === "deal" ? "deals in your pipelines, open, won or lost" : "leads in your lead pipelines")

  withQuery(
    json(annotate(group.command("list"), { effects: LOCAL_READ })).description(
      `${one}s, newest first; status:open is what is still in play`,
    ),
    QUERIES[kind],
  )
    .summary(`${one}s, newest first`)
    .option("--limit <n>", `most ${one}s, up to 500`, positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listDeals(store, env, kind, words, limit)),
    )

  json(annotate(group.command("show"), { effects: LOCAL_READ, output: { entity: kind } }))
    .description(`one ${one} with its pipeline, stage, status, amount, the people on it and what it was read from`)
    .summary(`one ${one} with its stage, status, amount and people`)
    .argument("<ref>", `${kind}:<id>`)
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.deals.get(ref))),
    )

  json(annotate(group.command("context"), { effects: LOCAL_READ, output: { entity: "deal_context" } }))
    .description(
      `one ${one} whole: its stages, client, people with their roles and standing, owner, project, invoices and ` +
        `payments as stored, its people's messages, mail and meetings in its lifetime (\`proposed\`: they share ` +
        "people, nothing links them), open tasks and `coverage`. A stage named Won is not a payment",
    )
    .summary(`one ${one}: stages, people, project, money, messages and tasks`)
    .argument("<ref>", `${kind}:<id>`)
    .option("--brief", "the compact form for a model's context: names, roles, totals and counts")
    .option("--limit <n>", "most items in each section", positive, 20)
    .action(async (ref: string, options: { brief?: boolean; limit: number; json?: boolean }, command: Command) => {
      const answer = await withStore(env, async (store) => {
        const scope = await groupScopeOf(store, env)
        return lockedCoverage(
          store,
          env,
          await dealContext(store, ref, {
            limit: options.limit,
            ...(scope === undefined ? {} : { accounts: scope.accounts }),
            deniedKinds: deniedCrmKinds(command, env),
          }),
        )
      })
      if (answer.deal.kind !== kind)
        throw new CliError("validation_error", `${ref} is a ${answer.deal.kind} — memo ${answer.deal.kind}s context`)
      print(
        options.json,
        itemAnswer(options.brief ? dealBrief(answer) : answer),
        options.brief ? dealBriefText(dealBrief(answer)) : dealText(answer),
      )
    })

  json(annotate(group.command("update"), { effects: LOCAL_WRITE, output: { entity: kind } }))
    .description(
      `set the project a ${one} belongs to; a CRM's copy takes it too, and the next sync keeps it. An empty value ` +
        "clears it",
    )
    .summary(`set the project a ${one} belongs to`)
    .argument("<ref>", `${kind}:<id>`)
    .requiredOption("--project <project>", "the project: its key or project:<id>")
    .action(async (ref: string, options: { project: string; json?: boolean }) => {
      const by = authorOf(env)
      await run(options.json, async (store) =>
        itemAnswer(
          await store.deals.setProject(ref, {
            project: options.project === "" ? null : await canonicalProject(store, options.project),
            by,
          }),
        ),
      )
    })

  json(
    annotate(group.command("add"), { effects: LOCAL_WRITE, output: { entity: kind }, literal_after_dashes: true })
      .option("--organization <organization>", "the client: organization:<id>")
      .option("--person <uid>", `a person on the ${one}: person:<id>; repeat for another, up to 20`, collect)
      .option("--role <role>", `what those people are on it: ${DEAL_ROLES.join(", ")}; contact by default`)
      .option("--due <time>", "the day you expect it to close, such as 2026-12-01")
      .option("--project <project>", "the project it belongs to: its key or project:<id>")
      .option("--reason <text>", "why an agent records it, kept with it")
      .option("--evidence <ref...>", "what shows it, up to 8: msg:, note:, document: or another reference"),
  )
    .description(`record a ${one} in a stage; it is written at once, whoever runs it`)
    .summary(`record a ${one} in a stage`)
    .argument("<title>", hope)
    .argument(
      kind === "deal" ? "<stage>" : "[stage]",
      kind === "deal"
        ? "the stage it is in; Sales/Quote or pipeline:3/Quote names the pipeline when two have that stage"
        : "the stage it is in; the first stage of the only lead pipeline when left out",
    )
    .argument("[amount]", "the expected amount, a decimal such as 500000.00")
    .argument("[currency]", "ISO 4217, such as RUB; given with the amount")
    .action(
      async (
        title: string,
        stage: string | undefined,
        amount: string | undefined,
        currency: string | undefined,
        options: AddOptions,
      ) => {
        const by = authorOf(env)
        const role = roleOf(options.role)
        await run(options.json, async (store) => {
          const closeDate = dayOf(options.due)
          return itemAnswer(
            await store.deals.add({
              by,
              kind,
              title,
              ...stageOf(stage),
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
              ...(options.reason === undefined ? {} : { reason: options.reason }),
              ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
            }),
          )
        })
      },
    )

  json(annotate(group.command("move"), { effects: LOCAL_WRITE, output: { entity: kind } }))
    .description(
      `move a ${one} to another stage of its pipeline; a won or lost stage closes it, an open one reopens it`,
    )
    .summary(`move a ${one} to another stage`)
    .argument("<ref>", `${kind}:<id>`)
    .argument("<stage>", `a stage of the ${one}'s pipeline`)
    .action(async (ref: string, stage: string, options: { json?: boolean }) => {
      const by = authorOf(env)
      await run(options.json, async (store) => itemAnswer(await store.deals.move(ref, { stage, by })))
    })

  json(
    annotate(group.command("close"), { effects: LOCAL_WRITE, output: { entity: kind } })
      .option("--occurred-time <time>", "the day it closed, such as 2026-11-20; today when left out")
      .option("--reason <text>", "why it was won or lost, kept with it"),
  )
    .description(`close a ${one} as won or lost; it moves to its pipeline's won or lost stage when there is one`)
    .summary(`close a ${one} as won or lost`)
    .argument("<ref>", `${kind}:<id>`)
    .argument("<outcome>", "won or lost")
    .action(
      async (ref: string, outcome: string, options: { occurredTime?: string; reason?: string; json?: boolean }) => {
        if (outcome !== "won" && outcome !== "lost")
          throw new CliError("validation_error", `a ${one} closes as won or lost`, { param: "outcome" })
        const by = authorOf(env)
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

const percent = (share: number | null) => (share === null ? "" : `, ${Math.round(share * 100)}% go on`)

/** "Sales (deal), pipeline:2" then a line per stage: open now, reached, and the share that goes on. */
const funnelText = (report: PipelineReport): string =>
  [
    `${report.name} (${report.kind}), ${report.ref}${report.since === null ? "" : `, made since ${report.since}`}`,
    ...report.stages.map(
      (stage) =>
        `  ${stage.position}. ${stage.name}${stage.outcome === "open" ? "" : ` [${stage.outcome}]`}: ` +
        `${stage.open} open, ${stage.reached} reached${percent(stage.conversion)}`,
    ),
    `  ${report.totals.items} in all: ${report.totals.open} open, ${report.totals.won} won, ${report.totals.lost} lost` +
      (report.totals.winRate === null ? "" : `, win rate ${Math.round(report.totals.winRate * 100)}%`),
  ].join("\n")

const inScope = (scope: GroupScope | undefined) => (pipeline: Pipeline) =>
  scope === undefined || pipeline.account === null || scope.has(pipeline.account)

/** In a group a name means the group's pipeline: one outside it is never found, and never makes the name ambiguous. */
const pipelineInGroup = async (store: MessageStore, env: NodeJS.ProcessEnv, reference: string) => {
  const scope = await groupScopeOf(store, env)
  if (scope === undefined || /^pipeline:\d+$/.test(reference.trim())) return reference
  const name = reference.trim().toLocaleLowerCase()
  const named = (await store.deals.pipelines()).filter(
    (one) => one.name.toLocaleLowerCase() === name && inScope(scope)(one),
  )
  if (named.length === 1) return (named[0] as Pipeline).ref
  if (named.length === 0)
    throw new CliError("not_found", `no pipeline named ${reference.trim()} in group:${scope.run.name}`, {
      reason: "pipeline.not-found",
    })
  throw new CliError(
    "validation_error",
    `more than one pipeline in group:${scope.run.name} is named ${reference.trim()}: ` +
      `${named.map((one) => one.ref).join(", ")}; name one by its reference`,
    { reason: "pipeline.ambiguous" },
  )
}

/** `memo deals`, `memo leads` and `memo pipelines`: sales pipelines and what is in them. */
export const dealCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run, print } = answers(program, streams, env)

  const pipelines = program
    .command("pipelines")
    .description("sales pipelines: the stages a deal or a lead goes through, in order, and how many get through each")
    .summary("sales pipelines, their stages and conversion")

  withQuery(
    json(annotate(pipelines.command("list"), { effects: LOCAL_READ })).description(
      "every pipeline with its stages in order and how many open deals or leads stand in each",
    ),
    PIPELINE_QUERY,
  )
    .summary("every pipeline with its stages")
    .action((words: string[], options: { json?: boolean }) =>
      run(options.json, async (store) => {
        const terms = queryTerms(words, PIPELINE_QUERY, "pipelines list")
        const name = terms.get("name")?.toLocaleLowerCase()
        const kind = terms.get("kind") as DealKind | undefined
        const scope = await groupScopeOf(store, env)
        const all = (await store.deals.pipelines(kind === undefined ? {} : { kind })).filter(inScope(scope))
        const writer = await withWriter(store, scope)
        return wholeList(
          "pipelines list",
          (name === undefined ? all : all.filter((one) => one.name.toLocaleLowerCase() === name)).map(writer),
        )
      }),
    )

  json(
    annotate(pipelines.command("show"), { effects: LOCAL_READ, output: { entity: "pipeline" } }).option(
      "--since-time <time>",
      "count only deals or leads made since this day, such as 2026-09-01",
    ),
  )
    .description(
      "one pipeline's funnel: per stage the open deals or leads in it, how many reached it, and the share that " +
        "went on to the next stage; then won, lost and the win rate",
    )
    .summary("one pipeline's stages with counts and conversion")
    .argument("<pipeline>", "pipeline:<id>, or a name only one pipeline has")
    .action(async (pipeline: string, options: { sinceTime?: string; json?: boolean }) => {
      const since = dayOf(options.sinceTime)
      const report = await withStore(env, async (store) =>
        store.deals.pipeline(await pipelineInGroup(store, env, pipeline), since === undefined ? {} : { since }),
      )
      print(options.json, itemAnswer(report), funnelText(report))
    })

  json(
    annotate(pipelines.command("add"), { effects: LOCAL_WRITE, literal_after_dashes: true }).option(
      "--kind <kind>",
      "what it holds: deal or lead; deal by default",
    ),
  )
    .description(
      "make a pipeline with its stages in order; a stage named won or lost (any letter case) ends a deal or lead " +
        "as that",
    )
    .summary("make a pipeline with its stages")
    .argument("<name>", "the pipeline's name, such as Sales")
    .argument("<stage...>", "its stages in order, such as Call Quote Contract won lost")
    .action(async (name: string, stages: string[], options: { kind?: string; json?: boolean }) => {
      const kind = options.kind ?? "deal"
      if (!(DEAL_KINDS as readonly string[]).includes(kind))
        throw new CliError("validation_error", "--kind is deal or lead", { param: "--kind" })
      const by = authorOf(env)
      await run(options.json, async (store) =>
        itemAnswer(
          await store.deals.addPipeline({
            name,
            kind: kind as DealKind,
            stages: stages.map((stage) => {
              const word = stage.trim().toLocaleLowerCase()
              return word === "won" || word === "lost" ? { name: stage, outcome: word } : stage
            }),
            by,
          }),
        ),
      )
    })

  itemCommands(program, "deal", { run, print }, env)
  itemCommands(program, "lead", { run, print }, env)
}

/** Open deals `projects status` shows, soonest expected close first; more than this is a count. */
const STATUS_DEALS = 5

/** The open deals of these projects. */
export const openDealsOf = async (store: MessageStore, projects: readonly string[]) => {
  const found = (await Promise.all(projects.map((project) => store.deals.list({ project, status: "open" })))).flat()
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
