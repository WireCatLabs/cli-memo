import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { FINANCE_REVIEWS, INVOICE_DIRECTIONS, SUBSCRIPTION_STATUSES } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, SubscriptionFilter } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"
import { withSources } from "../records/sources.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dayOf, today } from "./finance.js"
import { choice, given, json, needed, optionalChoice, PROPOSES, type Written, writeMeta, writtenBy } from "./written.js"

export const SUBSCRIPTION_QUERY = {
  entity: "subscription",
  backend: "native",
  fields: [
    termField("status", "enum", "status:active", { values: SUBSCRIPTION_STATUSES }),
    termField("direction", "enum", "direction:payable", { values: INVOICE_DIRECTIONS }),
    termField("supplier", "ref", 'supplier:"organization:3"'),
    termField("customer", "ref", 'customer:"organization:3"'),
    termField("project", "kw", "project:PMED"),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
    termField("renews", "time", "renews:2026-12-01"),
  ],
} as const satisfies QueryRegistry

export const listSubscriptions = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, SUBSCRIPTION_QUERY, "subscriptions list")
  const project = terms.get("project")
  const filter: SubscriptionFilter = given({
    status: terms.get("status") as SubscriptionFilter["status"],
    direction: terms.get("direction") as SubscriptionFilter["direction"],
    supplier: terms.get("supplier"),
    customer: terms.get("customer"),
    review: terms.get("review") as SubscriptionFilter["review"],
    renewsBy: dayOf(terms.get("renews")),
    project: project === undefined ? undefined : await canonicalProject(store, project),
  })
  return pageOf("subscriptions list", limit, (most) => store.subscriptions.list({ ...filter, limit: most }))
}

interface SubscriptionOptions extends Written {
  status?: string
  supplier?: string
  customer?: string
  product?: string
  contract?: string
  period?: string
  startDate?: string
  trialEndDate?: string
  endDate?: string
}

const parts = (command: Command) =>
  command
    .option("--status <state>", `${SUBSCRIPTION_STATUSES.join(", ")}; trial needs --trial-end-date`)
    .option("--supplier <party>", "who supplies it: person:<uid> or organization:<id>; you, when you bill it")
    .option(
      "--customer <party>",
      "who receives it and pays for it: person:<uid> or organization:<id>; you, when you pay",
    )
    .option("--product <product>", "the product or service it is for: product:<id>")
    .option("--contract <contract>", "the contract it runs under: contract:<id>")
    .option("--period <count-unit>", "how often it is charged: a count and a unit, such as 1-month or 1-year")
    .option("--start-date <date>", "the first day it runs, YYYY-MM-DD")
    .option("--trial-end-date <date>", "the day its free trial ends, YYYY-MM-DD")

const fieldsOf = (options: SubscriptionOptions) =>
  given({
    status: optionalChoice(options.status, SUBSCRIPTION_STATUSES, "--status"),
    supplier: options.supplier,
    customer: options.customer,
    product: options.product,
    contract: options.contract,
    every: options.period,
    startDate: dayOf(options.startDate),
    trialEndDate: dayOf(options.trialEndDate),
    endDate: dayOf(options.endDate),
  })

/** `memo subscriptions`: what the owner bills or pays on a schedule, and its price history. */
export const subscriptionCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const subscriptions = program
    .command("subscriptions")
    .description(
      "subscriptions you bill or pay: who supplies it, who pays, how often, and every price it had; a price is " +
        "never changed, a new one is added",
    )
    .summary("subscriptions you bill or pay, and their prices")

  withQuery(
    json(annotate(subscriptions.command("list"), { effects: LOCAL_READ })).description(
      "subscriptions, newest first; renews:2026-12-01 lists those that renew by then",
    ),
    SUBSCRIPTION_QUERY,
  )
    .option("--limit <n>", "most subscriptions, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listSubscriptions(store, words, limit)),
    )

  json(annotate(subscriptions.command("show"), { effects: LOCAL_READ, output: { entity: "subscription" } }))
    .description("one subscription with its parties, dates, current price and every price it had")
    .argument("<subscription>", "subscription:<id>")
    .action((ref: string, options: { json?: boolean }, command: Command) =>
      run(options.json, async (store) =>
        itemAnswer(await withSources(command, store, await store.subscriptions.get(ref))),
      ),
    )

  json(
    writeMeta(
      parts(
        annotate(subscriptions.command("add"), {
          effects: LOCAL_WRITE,
          output: { entity: "subscription" },
          literal_after_dashes: true,
        }),
      ).option("--kind <kind>", "receivable (you bill it) or payable (you pay it)"),
    ),
  )
    .description(`record a subscription and its first price; ${PROPOSES}`)
    .summary("record a subscription; an agent's waits for your review")
    .argument("<name>", "what it is, such as Hosting")
    .argument("<amount>", "its price for one period, a decimal such as 990.00")
    .argument("<currency>", "ISO 4217, such as RUB")
    .action(async (name: string, amount: string, currency: string, options: SubscriptionOptions, command: Command) => {
      const by = await whoRuns(command, env, {
        asOwner: options.asOwner,
        question: "record this subscription as yours?",
      })
      await run(options.json, async (store) => {
        const startDate = dayOf(options.startDate) ?? today()
        return itemAnswer(
          await store.subscriptions.add({
            ...(await writtenBy(store, by, options)),
            ...fieldsOf(options),
            name,
            direction: choice(options.kind, INVOICE_DIRECTIONS, "--kind"),
            every: needed(options.period, "--period", "how often it is charged, such as 1-month"),
            startDate,
            prices: [{ amount, currency, effectiveFrom: startDate }],
          }),
        )
      })
    })

  json(
    byOption(
      parts(annotate(subscriptions.command("update"), { effects: LOCAL_WRITE, output: { entity: "subscription" } }))
        .option("--title <title>", "its new name")
        .option("--end-date <date>", "the last day it runs, YYYY-MM-DD"),
    ),
  )
    .description(
      "change a subscription's status, schedule, dates or parties; pause it with --status paused. You change any, an " +
        "agent only one it proposed that is still proposed. A new price is subscriptions prices add",
    )
    .summary("change a subscription")
    .argument("<subscription>", "subscription:<id>")
    .action(async (ref: string, options: SubscriptionOptions, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `change ${ref} as yours?` })
      await run(options.json, async (store) =>
        itemAnswer(
          await store.subscriptions.update(ref, { by, ...fieldsOf(options), ...given({ name: options.title }) }),
        ),
      )
    })

  json(
    byOption(
      annotate(subscriptions.command("cancel"), { effects: LOCAL_WRITE, output: { entity: "subscription" } }).option(
        "--occurred-time <time>",
        "the day it was cancelled, such as 2026-11-01; today when left out",
      ),
    ),
  )
    .description("mark a subscription cancelled on a day; it stays, with its prices")
    .summary("cancel a subscription")
    .argument("<subscription>", "subscription:<id>")
    .action(
      async (ref: string, options: { occurredTime?: string; asOwner?: boolean; json?: boolean }, command: Command) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `cancel ${ref} as yours?` })
        await run(options.json, async (store) =>
          itemAnswer(
            await store.subscriptions.update(ref, {
              by,
              status: "cancelled",
              cancelledDate: dayOf(options.occurredTime) ?? today(),
            }),
          ),
        )
      },
    )

  const prices = subscriptions
    .command("prices")
    .description("the prices a subscription had, each from a day on; one is never changed, a new one is added")
    .summary("a subscription's prices")

  json(
    byOption(
      annotate(prices.command("add"), { effects: LOCAL_WRITE, output: { entity: "subscription_price" } })
        .option(
          "--start-date <date>",
          "the first day the price holds, YYYY-MM-DD; the subscription's start when left out",
        )
        .option("--reason <text>", "why an agent proposes it, for the owner who decides"),
    ),
  )
    .description(
      `add a price from a day on; the earlier ones stay as they were. ${PROPOSES}, and the subscription stays as it is`,
    )
    .summary("add a subscription's new price")
    .argument("<subscription>", "subscription:<id>")
    .argument("<amount>", "the price for one period, a decimal such as 1190.00")
    .argument("<currency>", "ISO 4217, such as RUB")
    .action(
      async (
        ref: string,
        amount: string,
        currency: string,
        options: { startDate?: string; reason?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, {
          asOwner: options.asOwner,
          question: `add a price to ${ref} as yours?`,
        })
        await run(options.json, async (store) =>
          itemAnswer(
            await store.subscriptions.addPrice(ref, {
              by,
              amount,
              currency,
              ...given({
                effectiveFrom: dayOf(options.startDate),
                reason: by === "owner" ? undefined : options.reason,
              }),
            }),
          ),
        )
      },
    )
}
