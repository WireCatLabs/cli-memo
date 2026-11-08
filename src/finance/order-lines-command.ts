import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { type answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { given, json } from "./written.js"

const WHO_CHANGES = "you change any order's lines; an agent only those of an order it proposed that is still proposed"

/** `memo orders lines`: what an order is made of; its total is then their sum. */
export const orderLineCommands = (
  orders: Command,
  run: ReturnType<typeof answers>["run"],
  env: NodeJS.ProcessEnv,
): void => {
  const lines = orders
    .command("lines")
    .description(`the lines of an order, each a quantity at a price; the order's total is their sum. ${WHO_CHANGES}`)
    .summary("the lines of an order")

  json(
    byOption(
      annotate(lines.command("add"), {
        effects: LOCAL_WRITE,
        output: { entity: "order" },
        literal_after_dashes: true,
      }).option("--product <product>", "the product or service it is: its name and price are copied onto the line"),
    ),
  )
    .description(
      `add a line at the end of an order that has a currency (orders add with an amount): quantity × price; the ` +
        `order's total becomes the sum of its lines. With --product its name and ` +
        `price are copied, so a later price change leaves the line as it is. ${WHO_CHANGES}`,
    )
    .summary("add a line to an order")
    .argument("<order>", "order:<id>")
    .argument("<quantity>", "how many, a decimal such as 12 or 1.5")
    .argument("[price]", "the price of one, a decimal such as 10000.00; the product's when left out")
    .argument("[description...]", "what the line is, in a few words; the product's name when left out")
    .action(
      async (
        order: string,
        quantity: string,
        price: string | undefined,
        words: string[],
        options: { product?: string; asOwner?: boolean; json?: boolean },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, {
          asOwner: options.asOwner,
          question: `change ${order}'s lines as yours?`,
        })
        await run(options.json, async (store) =>
          itemAnswer(
            await store.orders.addLine(order, {
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

  json(byOption(annotate(lines.command("remove"), { effects: LOCAL_WRITE, output: { entity: "order" } })))
    .description(`take a line off an order; the others keep their positions, and the last line stays. ${WHO_CHANGES}`)
    .summary("take a line off an order")
    .argument("<order>", "order:<id>")
    .argument("<position>", "the line's position, from 1, as orders show lists it", positive)
    .action(
      async (order: string, position: number, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
        const by = await whoRuns(command, env, {
          asOwner: options.asOwner,
          question: `change ${order}'s lines as yours?`,
        })
        await run(options.json, async (store) => itemAnswer(await store.orders.removeLine(order, { position, by })))
      },
    )
}
