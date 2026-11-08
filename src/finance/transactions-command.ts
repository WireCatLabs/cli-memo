import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { FINANCE_REVIEWS, MONEY_DIRECTIONS, TRANSACTION_STATUSES } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, TransactionFilter } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dayOf, today } from "./finance.js"
import { choice, given, json, optionalChoice, PROPOSES, type Written, writeMeta, writtenBy } from "./written.js"

export const TRANSACTION_QUERY = {
  entity: "transaction",
  backend: "native",
  fields: [
    termField("wallet", "ref", 'wallet:"wallet:2"'),
    termField("direction", "enum", "direction:out", { values: MONEY_DIRECTIONS }),
    termField("status", "enum", "status:pending", { values: TRANSACTION_STATUSES }),
    termField("category", "kw", "category:Rent"),
    termField("project", "kw", "project:PMED"),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
    termField("uncategorized", "bool", "uncategorized:true"),
  ],
} as const satisfies QueryRegistry

export const listTransactions = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, TRANSACTION_QUERY, "transactions list")
  const project = terms.get("project")
  const filter: TransactionFilter = given({
    wallet: terms.get("wallet"),
    direction: terms.get("direction") as TransactionFilter["direction"],
    status: terms.get("status") as TransactionFilter["status"],
    category: terms.get("category"),
    review: terms.get("review") as TransactionFilter["review"],
    uncategorized: terms.has("uncategorized") ? terms.get("uncategorized") === "true" : undefined,
    project: project === undefined ? undefined : await canonicalProject(store, project),
  })
  return pageOf("transactions list", limit, (most) => store.transactions.list({ ...filter, limit: most }))
}

interface TransactionOptions extends Written {
  status?: string
  description?: string
  payment?: string
}

const STATUS_HELP = `${TRANSACTION_STATUSES.join(" or ")}; only a booked one counts in a balance`

/** `memo transactions`: what a bank statement says moved, and the categories it is split into. */
export const transactionCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const transactions = program
    .command("transactions")
    .description(
      "money a wallet's statement shows moving in or out, the payment it settles, and the categories it is split into",
    )
    .summary("money moving in or out of your wallets")

  withQuery(
    json(annotate(transactions.command("list"), { effects: LOCAL_READ })).description(
      "transactions, newest first; uncategorized:true lists those not fully split into categories",
    ),
    TRANSACTION_QUERY,
  )
    .summary("transactions, newest first")
    .option("--limit <n>", "most transactions, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listTransactions(store, words, limit)),
    )

  json(annotate(transactions.command("show"), { effects: LOCAL_READ, output: { entity: "transaction" } }))
    .description("one transaction with its wallet, payment, splits and what is not categorized")
    .argument("<transaction>", "transaction:<id>")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.transactions.get(ref))),
    )

  json(
    writeMeta(
      annotate(transactions.command("add"), {
        effects: LOCAL_WRITE,
        output: { entity: "transaction" },
        literal_after_dashes: true,
      })
        .option("--kind <kind>", "in (money came in) or out (money went out)")
        .option("--occurred-time <time>", "the day the statement shows, such as 2026-11-01; today when left out")
        .option("--description <text>", "what the statement says, as it says it")
        .option("--status <state>", `${STATUS_HELP}; booked when left out`)
        .option("--payment <payment>", "the payment it settles, same amount, currency and direction: payment:<id>"),
    ),
  )
    .description(`record what a wallet's statement shows moved, in the wallet's currency; ${PROPOSES}`)
    .summary("record a transaction; an agent's waits for your review")
    .argument("<wallet>", "wallet:<id>")
    .argument("<amount>", "a decimal above 0, such as 500.00")
    .action(async (wallet: string, amount: string, options: TransactionOptions, command: Command) => {
      const by = await whoRuns(command, env, {
        asOwner: options.asOwner,
        question: "record this transaction as yours?",
      })
      await run(options.json, async (store) =>
        itemAnswer(
          await store.transactions.add({
            ...(await writtenBy(store, by, options)),
            wallet,
            amount,
            direction: choice(options.kind, MONEY_DIRECTIONS, "--kind"),
            statementDate: dayOf(options.occurredTime) ?? today(),
            ...given({
              status: optionalChoice(options.status, TRANSACTION_STATUSES, "--status"),
              description: options.description,
              payment: options.payment,
            }),
          }),
        ),
      )
    })

  json(
    byOption(
      annotate(transactions.command("update"), { effects: LOCAL_WRITE, output: { entity: "transaction" } })
        .option("--status <state>", STATUS_HELP)
        .option("--payment <payment>", "the payment it settles, same amount, currency and direction: payment:<id>")
        .option("--description <text>", "what the statement says, as it says it"),
    ),
  )
    .description(
      "book a pending transaction, link it to the payment it settles, or fix its text; you change any, an agent only " +
        "one it proposed that is still proposed",
    )
    .summary("book a transaction or link it to its payment")
    .argument("<transaction>", "transaction:<id>")
    .action(async (ref: string, options: TransactionOptions, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `change ${ref} as yours?` })
      await run(options.json, async (store) =>
        itemAnswer(
          await store.transactions.update(ref, {
            by,
            ...given({
              status: optionalChoice(options.status, TRANSACTION_STATUSES, "--status"),
              payment: options.payment,
              description: options.description,
            }),
          }),
        ),
      )
    })

  const splits = transactions
    .command("splits")
    .description(
      "the categories a transaction's amount is split into; together never more than the amount, the rest is " +
        "uncategorized",
    )
    .summary("a transaction's categories")

  const WHO = "you split any transaction; an agent only one it proposed that is still proposed"

  json(
    byOption(
      annotate(splits.command("add"), { effects: LOCAL_WRITE, output: { entity: "transaction" } }).option(
        "--project <project>",
        "the project this part belongs to: its key or project:<id>",
      ),
    ),
  )
    .description(`put part of a transaction's amount under a category; ${WHO}`)
    .summary("put part of a transaction under a category")
    .argument("<transaction>", "transaction:<id>")
    .argument("<amount>", "a decimal above 0, such as 120.00")
    .argument("<category...>", "the category, in a word or a few, such as Rent")
    .action(
      async (
        ref: string,
        amount: string,
        words: string[],
        options: { project?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `split ${ref} as yours?` })
        await run(options.json, async (store) =>
          itemAnswer(
            await store.transactions.addSplit(ref, {
              by,
              amount,
              category: words.join(" "),
              ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
            }),
          ),
        )
      },
    )

  json(byOption(annotate(splits.command("remove"), { effects: LOCAL_WRITE, output: { entity: "transaction" } })))
    .description(`take a split off a transaction; its amount is uncategorized again. ${WHO}`)
    .summary("take a split off a transaction")
    .argument("<transaction>", "transaction:<id>")
    .argument("<position>", "the split's position, from 1, as transactions show lists it", positive)
    .action(async (ref: string, position: number, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `change ${ref}'s splits as yours?` })
      await run(options.json, async (store) => itemAnswer(await store.transactions.removeSplit(ref, { position, by })))
    })
}
