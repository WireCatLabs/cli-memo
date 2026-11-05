import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { FINANCE_REVIEWS, ORDER_PURPOSES, ORDER_STATUSES } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, OrderFilter } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dayOf, partyOf } from "./finance.js"

export const ORDER_QUERY = {
  entity: "order",
  backend: "native",
  fields: [
    termField("project", "kw", "project:PMED"),
    termField("status", "enum", "status:shipped", { values: ORDER_STATUSES }),
    termField("purpose", "enum", "purpose:personal", { values: ORDER_PURPOSES }),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
    termField("customer", "ref", 'customer:"organization:3"'),
    termField("supplier", "kw", 'supplier:"Shop One"'),
    termField("number", "kw", "number:A-1042"),
  ],
} as const satisfies QueryRegistry

export const listOrders = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, ORDER_QUERY, "orders list")
  const filter: OrderFilter = {
    ...(terms.has("project") ? { project: await canonicalProject(store, terms.get("project") as string) } : {}),
    ...(terms.has("status") ? { status: terms.get("status") as OrderFilter["status"] } : {}),
    ...(terms.has("purpose") ? { purpose: terms.get("purpose") as OrderFilter["purpose"] } : {}),
    ...(terms.has("review") ? { review: terms.get("review") as OrderFilter["review"] } : {}),
    ...(terms.has("customer") ? { customer: terms.get("customer") as string } : {}),
    ...(terms.has("supplier") ? { supplierName: terms.get("supplier") as string } : {}),
    ...(terms.has("number") ? { number: terms.get("number") as string } : {}),
  }
  return pageOf("orders list", limit, (most) => store.orders.list({ ...filter, limit: most }))
}

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], flag: string): T => {
  if (value === undefined || !(allowed as readonly string[]).includes(value))
    throw new CliError("validation_error", `${flag} is one of ${allowed.join(", ")}`, { param: flag })
  return value as T
}

interface AddOptions {
  kind?: string
  person?: string
  organization?: string
  title?: string
  occurredTime?: string
  project?: string
  reason?: string
  evidence?: string[]
  asOwner?: boolean
  json?: boolean
}

const json = (command: Command) => command.option("--json", "print JSON; --json=ref,title keeps only those fields")

/** `memo orders`: what the owner, his business or a client ordered, and how far delivery got. */
export const orderCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const orders = program
    .command("orders")
    .description("orders you placed or took, for whom, from which shop, and how far delivery got")
    .summary("orders you placed or took, and how far delivery got")

  withQuery(
    json(annotate(orders.command("list"), { effects: LOCAL_READ })).description(
      "orders, newest first; review:proposed is what waits for you",
    ),
    ORDER_QUERY,
  )
    .option("--limit <n>", "most orders, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listOrders(store, words, limit)),
    )

  json(annotate(orders.command("show"), { effects: LOCAL_READ, output: { entity: "order" } }))
    .description("one order with its customer, shop, amount, status and the mail it was read from")
    .argument("<ref>", "order:<id>")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.orders.get(ref))),
    )

  json(
    byOption(
      annotate(orders.command("add"), { effects: LOCAL_WRITE, output: { entity: "order" }, literal_after_dashes: true })
        .option("--kind <kind>", `why it was ordered: ${ORDER_PURPOSES.join(", ")}`)
        .option("--person <uid>", "whom it is for, when not you: person:<id>")
        .option("--organization <organization>", "whom it is for, when not you: organization:<id>")
        .option("--title <title>", "the shop's order number")
        .option("--occurred-time <time>", "the day it was ordered, such as 2026-11-01")
        .option("--project <project>", "the project it belongs to: its key or project:<id>")
        .option("--reason <text>", "why an agent proposes it, for the owner who decides")
        .option("--evidence <ref...>", "what shows it, up to 8: msg:, note:, document: or another reference"),
    ),
  )
    .description(
      "record a placed order; yours is confirmed at once, an agent's waits as proposed for you in memo review",
    )
    .summary("record an order; an agent's waits for your review")
    .argument("<shop>", "the shop or supplier, as its mail names it")
    .argument("[amount]", "the order's amount, a decimal such as 2499.00")
    .argument("[currency]", "ISO 4217, such as RUB; given with the amount")
    .action(
      async (
        shop: string,
        amount: string | undefined,
        currency: string | undefined,
        options: AddOptions,
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "record this order as yours?" })
        await run(options.json, async (store) => {
          const customer = partyOf(options, false)
          const orderDate = dayOf(options.occurredTime)
          return itemAnswer(
            await store.orders.add({
              by,
              purpose: oneOf(options.kind, ORDER_PURPOSES, "--kind"),
              supplierName: shop,
              ...(customer === undefined ? {} : { customer }),
              ...(options.title === undefined ? {} : { number: options.title }),
              ...(amount === undefined ? {} : { total: amount }),
              ...(currency === undefined ? {} : { currency }),
              ...(orderDate === undefined ? {} : { orderDate }),
              ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
              ...(by !== "owner" && options.reason !== undefined ? { reason: options.reason } : {}),
              ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
            }),
          )
        })
      },
    )
}
