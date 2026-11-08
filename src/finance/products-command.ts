import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { CATALOG_KINDS } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, ProductFilter } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { authorOf } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"
import { withSources } from "../records/sources.js"
import { today } from "./finance.js"
import { given, json, onOff, optionalChoice } from "./written.js"

export const PRODUCT_QUERY = {
  entity: "product",
  backend: "native",
  fields: [
    termField("kind", "enum", "kind:service", { values: CATALOG_KINDS }),
    termField("supplier", "ref", 'supplier:"organization:3"'),
    termField("archived", "bool", "archived:true"),
    termField("name", "kw", 'name:"Bike rental"'),
  ],
} as const satisfies QueryRegistry

export const listProducts = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, PRODUCT_QUERY, "products list")
  const filter: ProductFilter = given({
    kind: terms.get("kind") as ProductFilter["kind"],
    supplier: terms.get("supplier"),
    archived: terms.has("archived") ? terms.get("archived") === "true" : undefined,
    name: terms.get("name"),
  })
  return pageOf("products list", limit, (most) => store.products.list({ ...filter, limit: most }))
}

interface ProductOptions {
  kind?: string
  unit?: string
  sku?: string
  supplier?: string
  description?: string
  json?: boolean
}

interface UpdateOptions {
  amount?: string
  currency?: string
  title?: string
  unit?: string
  description?: string
  archived?: string
  json?: boolean
}

/** `memo products`: what the owner sells or buys, written directly by anyone, as it feeds no total. */
export const productCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const products = program
    .command("products")
    .description(
      "goods and services you sell or buy, with their prices; a line that names one copies its price, so a later " +
        "price change leaves the line as it was",
    )
    .summary("goods and services you sell or buy, with their prices")

  withQuery(
    json(annotate(products.command("list"), { effects: LOCAL_READ })).description(
      "products and services, by name; archived:true lists those no longer sold",
    ),
    PRODUCT_QUERY,
  )
    .option("--limit <n>", "most products, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listProducts(store, words, limit)),
    )

  json(annotate(products.command("show"), { effects: LOCAL_READ, output: { entity: "product" } }))
    .description("one product or service with its price, unit, supplier and stock code")
    .argument("<product>", "product:<id>")
    .action((ref: string, options: { json?: boolean }, command: Command) =>
      run(options.json, async (store) => itemAnswer(await withSources(command, store, await store.products.get(ref)))),
    )

  json(
    annotate(products.command("add"), {
      effects: LOCAL_WRITE,
      output: { entity: "product" },
      literal_after_dashes: true,
    })
      .option("--kind <kind>", `${CATALOG_KINDS.join(" or ")}; product when left out`)
      .option("--unit <text>", "what one of it is counted in, such as hour or month")
      .option("--sku <code>", "the stock code the seller gives it")
      .option("--supplier <party>", "who supplies it, when not you: person:<uid> or organization:<id>")
      .option("--description <text>", "what it is, in a sentence"),
  )
    .description("add a product or service you sell or buy; anyone adds one directly, as a price feeds no total")
    .summary("add a product or service")
    .argument("<name>", "its name, as an invoice or order line prints it")
    .argument("[amount]", "the price of one unit, a decimal such as 10000.00")
    .argument("[currency]", "ISO 4217, such as RUB; given with the amount")
    .action((name: string, amount: string | undefined, currency: string | undefined, options: ProductOptions) =>
      run(options.json, async (store) =>
        itemAnswer(
          await store.products.add({
            by: authorOf(env),
            name,
            ...given({
              kind: optionalChoice(options.kind, CATALOG_KINDS, "--kind"),
              unitPrice: amount,
              currency,
              unit: options.unit,
              sku: options.sku,
              supplier: options.supplier,
              description: options.description,
            }),
          }),
        ),
      ),
    )

  json(
    annotate(products.command("update"), { effects: LOCAL_WRITE, output: { entity: "product" } })
      .option("--amount <decimal>", "the new price of one unit, such as 12000.00; give --currency with it")
      .option("--currency <code>", "an ISO 4217 code, such as RUB")
      .option("--title <title>", "its new name")
      .option("--unit <text>", "what one of it is counted in, such as hour or month")
      .option("--description <text>", "what it is, in a sentence")
      .option(
        "--archived <on|off>",
        "on: no longer sold, and lines and subscriptions keep pointing at it; off: sold again",
      ),
  )
    .description(
      "change a product's price, name, unit or description, or archive it; lines already written keep theirs",
    )
    .summary("change or archive a product")
    .argument("<product>", "product:<id>")
    .action((ref: string, options: UpdateOptions) =>
      run(options.json, async (store) => {
        const archived = onOff(options.archived, "--archived")
        return itemAnswer(
          await store.products.update(ref, {
            by: authorOf(env),
            ...given({
              name: options.title,
              unitPrice: options.amount,
              currency: options.currency,
              unit: options.unit,
              description: options.description,
              archivedDate: archived === undefined ? undefined : archived ? today() : null,
            }),
          }),
        )
      }),
    )
}
