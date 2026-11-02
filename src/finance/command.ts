import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { INVOICE_DIRECTIONS, MONEY_DIRECTIONS } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dayOf, INVOICE_QUERY, listInvoices, listPayments, PAYMENT_QUERY, partyOf, today } from "./finance.js"

interface Written {
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

const PROPOSES = "yours is confirmed at once; an agent's waits as proposed for you in memo review"

const kindOf = <T extends string>(kind: string | undefined, kinds: readonly T[]): T => {
  if (kind === undefined || !(kinds as readonly string[]).includes(kind))
    throw new CliError("validation_error", `--kind is one of ${kinds.join(", ")}`, { param: "--kind" })
  return kind as T
}

/** The parts every finance write shares: who writes it, its project, and an agent's reason. */
const writtenBy = async (store: MessageStore, by: "owner" | { bot: string }, options: Written) => ({
  by,
  ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
  ...(by !== "owner" && options.reason !== undefined ? { reason: options.reason } : {}),
  ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
})

const party = (command: Command, what: string) =>
  command
    .option("--person <uid>", `the person ${what}: person:<id>`)
    .option("--organization <organization>", `the organization ${what}: organization:<id>`)

const writeMeta = (command: Command) =>
  byOption(
    command
      .option("--project <project>", "the project it belongs to: its key or project:<id>")
      .option("--reason <text>", "why an agent proposes it, for the owner who decides")
      .option("--evidence <ref...>", "what shows it, up to 8: msg:, note:, document: or another reference"),
  )

export const financeCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)

  const invoices = program
    .command("invoices")
    .description("invoices you issued or received, with their lines and what paid them; amounts per currency")
    .summary("invoices you issued or received, and what paid them")

  withQuery(
    json(annotate(invoices.command("list"), { effects: LOCAL_READ })).description(
      "invoices, newest first; review:proposed lists what waits for you",
    ),
    INVOICE_QUERY,
  )
    .option("--limit <n>", "most invoices, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listInvoices(store, words, limit)),
    )

  json(annotate(invoices.command("show"), { effects: LOCAL_READ, output: { entity: "invoice" } }))
    .description("one invoice with its lines and the payments allocated to it")
    .argument("<ref>", "invoice:<id>")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.finance.invoice(ref))),
    )

  json(
    writeMeta(
      party(
        annotate(invoices.command("add"), {
          effects: LOCAL_WRITE,
          output: { entity: "invoice" },
          literal_after_dashes: true,
        }),
        "billed or billing",
      )
        .option("--kind <kind>", "receivable (you bill them) or payable (they bill you)")
        .option("--title <title>", "the invoice's number, as printed on it")
        .option("--occurred-time <time>", "the day it was issued, such as 2026-11-01")
        .option("--due <time>", "the day it is due, such as 2026-11-15"),
    ),
  )
    .description(`record an invoice of one line; ${PROPOSES}`)
    .summary("record an invoice; an agent's waits for your review")
    .argument("<amount>", "a decimal, such as 50000.00")
    .argument("<currency>", "ISO 4217, such as RUB")
    .argument("<description...>", "what it bills, in a few words")
    .action(
      async (
        amount: string,
        currency: string,
        words: string[],
        options: Written & { due?: string },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "record this invoice as yours?" })
        await run(options.json, async (store) => {
          const issueDate = dayOf(options.occurredTime)
          const dueDate = dayOf(options.due)
          return itemAnswer(
            await store.finance.addInvoice({
              ...(await writtenBy(store, by, options)),
              direction: kindOf(options.kind, INVOICE_DIRECTIONS),
              counterparty: partyOf(options, true) as string,
              currency,
              lines: [{ description: words.join(" "), amount }],
              ...(options.title === undefined ? {} : { number: options.title }),
              ...(issueDate === undefined ? {} : { issueDate }),
              ...(dueDate === undefined ? {} : { dueDate }),
            }),
          )
        })
      },
    )

  const payments = program
    .command("payments")
    .description("money paid to you or by you, and the invoices each payment settles; amounts per currency")
    .summary("money paid to you or by you, and what it settles")

  withQuery(
    json(annotate(payments.command("list"), { effects: LOCAL_READ })).description(
      "payments, newest first; review:proposed lists what waits for you",
    ),
    PAYMENT_QUERY,
  )
    .option("--limit <n>", "most payments, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listPayments(store, words, limit)),
    )

  json(annotate(payments.command("show"), { effects: LOCAL_READ, output: { entity: "payment" } }))
    .description("one payment with the invoices it is allocated to")
    .argument("<ref>", "payment:<id>")
    .action((ref: string, options: { json?: boolean }) =>
      run(options.json, async (store) => itemAnswer(await store.finance.payment(ref))),
    )

  json(
    writeMeta(
      party(
        annotate(payments.command("add"), { effects: LOCAL_WRITE, output: { entity: "payment" } }),
        "who paid or was paid",
      )
        .option("--kind <kind>", "in (paid to you) or out (paid by you)")
        .option("--title <title>", "the payment's reference, such as the bank's purpose line")
        .option("--occurred-time <time>", "the day it was paid, such as 2026-11-01; today when left out"),
    ),
  )
    .description(`record a payment; ${PROPOSES}. payments allocate matches it to an invoice`)
    .summary("record a payment; an agent's waits for your review")
    .argument("<amount>", "a decimal, such as 50000.00")
    .argument("<currency>", "ISO 4217, such as RUB")
    .action(async (amount: string, currency: string, options: Written, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "record this payment as yours?" })
      await run(options.json, async (store) => {
        const direction = kindOf(options.kind, MONEY_DIRECTIONS)
        const counterparty = partyOf(options, false)
        return itemAnswer(
          await store.finance.addPayment({
            ...(await writtenBy(store, by, options)),
            direction,
            ...(counterparty === undefined
              ? {}
              : direction === "in"
                ? { payer: counterparty }
                : { payee: counterparty }),
            amount,
            currency,
            date: dayOf(options.occurredTime) ?? today(),
            ...(options.title === undefined ? {} : { reference: options.title }),
          }),
        )
      })
    })

  json(
    byOption(
      annotate(payments.command("allocate"), { effects: LOCAL_WRITE, output: { entity: "payment_allocation" } }),
    ),
  )
    .description(
      "settle part of an invoice with part of a payment, in their one currency, never beyond either; an agent " +
        "allocates only a payment it proposed",
    )
    .summary("settle part of an invoice with part of a payment")
    .argument("<payment>", "payment:<id>")
    .argument("<invoice>", "invoice:<id>")
    .argument("<amount>", "a decimal, such as 25000.00")
    .action(
      async (
        payment: string,
        invoice: string,
        amount: string,
        options: { asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `allocate ${payment} as yours?` })
        await run(options.json, async (store) =>
          itemAnswer(await store.finance.allocate({ payment, invoice, amount, by })),
        )
      },
    )
}
