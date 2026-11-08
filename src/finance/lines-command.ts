import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { type answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { given, json } from "./written.js"

type By = Awaited<ReturnType<typeof whoRuns>>

interface LineInput {
  by: By
  quantity: string
  unitPrice?: string
  description?: string
  product?: string
}

/** The two parents with lines; each keeps its own store calls and the words its help names it by. */
export const LINE_PARENTS = {
  order: {
    has: "an order that has a currency (orders add with an amount)",
    shown: "orders show",
    add: (store: MessageStore, ref: string, line: LineInput) => store.orders.addLine(ref, line),
    remove: (store: MessageStore, ref: string, input: { position: number; by: By }) =>
      store.orders.removeLine(ref, input),
  },
  invoice: {
    has: "an invoice that is not void; the total never falls below what confirmed payments settled",
    shown: "invoices show",
    add: (store: MessageStore, ref: string, line: LineInput) => store.finance.addInvoiceLine(ref, line),
    remove: (store: MessageStore, ref: string, input: { position: number; by: By }) =>
      store.finance.removeInvoiceLine(ref, input),
  },
} as const

/** `memo orders lines` and `memo invoices lines`: what it is made of; its total is then their sum. */
export const lineCommands = (
  parent: Command,
  kind: keyof typeof LINE_PARENTS,
  run: ReturnType<typeof answers>["run"],
  env: NodeJS.ProcessEnv,
): void => {
  const { has, shown, add, remove } = LINE_PARENTS[kind]
  const one = kind === "order" ? "an order" : "an invoice"
  const who = `you change any ${kind}'s lines; an agent only those of ${one} it proposed that is still proposed`
  const lines = parent
    .command("lines")
    .description(`the lines of ${one}, each a quantity at a price; its total is their sum. ${who}`)
    .summary(`the lines of ${one}`)

  const asker = (ref: string) => `change ${ref}'s lines as yours?`

  json(
    byOption(
      annotate(lines.command("add"), {
        effects: LOCAL_WRITE,
        output: { entity: kind },
        literal_after_dashes: true,
      }).option("--product <product>", "the product or service it is: its name and price are copied onto the line"),
    ),
  )
    .description(
      `add a line at the end of ${has}: quantity × price, and the total becomes the sum of the lines. With ` +
        `--product its name and price are copied, so a later price change leaves the line as it is. ${who}`,
    )
    .summary(`add a line to ${one}`)
    .argument(`<${kind}>`, `${kind}:<id>`)
    .argument("<quantity>", "how many, a decimal such as 12 or 1.5")
    .argument("[price]", "the price of one, a decimal such as 10000.00; the product's when left out")
    .argument("[description...]", "what the line is, in a few words; the product's name when left out")
    .action(
      async (
        ref: string,
        quantity: string,
        price: string | undefined,
        words: string[],
        options: { product?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: asker(ref) })
        await run(options.json, async (store) =>
          itemAnswer(
            await add(store, ref, {
              by,
              quantity,
              ...given({
                unitPrice: price,
                description: words.length > 0 ? words.join(" ") : undefined,
                product: options.product,
              }),
            }),
          ),
        )
      },
    )

  json(byOption(annotate(lines.command("remove"), { effects: LOCAL_WRITE, output: { entity: kind } })))
    .description(`take a line off ${one}; the others keep their positions, and the last line stays. ${who}`)
    .summary(`take a line off ${one}`)
    .argument(`<${kind}>`, `${kind}:<id>`)
    .argument("<position>", `the line's position, from 1, as ${shown} lists it`, positive)
    .action(async (ref: string, position: number, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: asker(ref) })
      await run(options.json, async (store) => itemAnswer(await remove(store, ref, { position, by })))
    })
}
