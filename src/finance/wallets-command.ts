import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { WALLET_KINDS } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, Wallet, WalletFilter } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { authorOf, byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"
import { dayOf } from "./finance.js"
import { given, json, optionalChoice } from "./written.js"

export const WALLET_QUERY = {
  entity: "wallet",
  backend: "native",
  fields: [
    termField("kind", "enum", "kind:card", { values: WALLET_KINDS }),
    termField("currency", "kw", "currency:RUB"),
  ],
} as const satisfies QueryRegistry

export const listWallets = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, WALLET_QUERY, "wallets list")
  const filter: WalletFilter = given({
    kind: terms.get("kind") as WalletFilter["kind"],
    currency: terms.get("currency"),
  })
  return pageOf("wallets list", limit, (most) => store.wallets.list({ ...filter, limit: most }))
}

/**
 * An imported wallet's opening balance as its source record gives it: only the owner sets the wallet's own, so until
 * then `wallets show` prints the source's beside it.
 */
const sourceSays = async (store: MessageStore, wallet: Wallet) => {
  if (wallet.openingBalance !== null || !wallet.source.startsWith("import:")) return null
  const provider = wallet.source.slice("import:".length)
  for (const { account } of (await store.accounts.accounts()).filter((key) => key.provider === provider)) {
    const [record] = await store.records.list({ provider, account, entity: wallet.ref, limit: 1 })
    const { opening_balance: balance, opening_date: date } = record?.fields ?? {}
    if (record && typeof balance === "string")
      return {
        openingBalance: balance,
        openingDate: typeof date === "string" ? date : null,
        record: `${record.type}:${record.externalId}`,
        account: `${provider}:${account}`,
      }
  }
  return null
}

/** `memo wallets`: where the owner's money is, with a balance computed from its confirmed, booked transactions. */
export const walletCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const wallets = program
    .command("wallets")
    .description(
      "bank accounts, cards and cash you keep money in, one currency each; a balance is the opening balance plus " +
        "confirmed, booked transactions, computed each time",
    )
    .summary("bank accounts, cards and cash, with their balances")

  withQuery(
    json(annotate(wallets.command("list"), { effects: LOCAL_READ })).description(
      "wallets with their balances today; kind:card lists the cards",
    ),
    WALLET_QUERY,
  )
    .option("--limit <n>", "most wallets, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listWallets(store, words, limit)),
    )

  json(
    annotate(wallets.command("show"), { effects: LOCAL_READ, output: { entity: "wallet" } }).option(
      "--until-time <time>",
      "the balance up to and including this day, such as 2026-10-31; today when left out",
    ),
  )
    .description(
      "one wallet with its balance, and beside it what is pending or proposed and not counted yet; for an imported " +
        "wallet whose opening balance you have not set, source_says gives the one its source sent",
    )
    .summary("one wallet with its balance and what is pending")
    .argument("<wallet>", "wallet:<id>")
    .action((ref: string, options: { untilTime?: string; json?: boolean }) =>
      run(options.json, async (store) => {
        const until = dayOf(options.untilTime)
        const wallet = await store.wallets.get(ref, until === undefined ? {} : { until })
        return itemAnswer({ ...wallet, sourceSays: await sourceSays(store, wallet) })
      }),
    )

  json(
    annotate(wallets.command("add"), { effects: LOCAL_WRITE, output: { entity: "wallet" }, literal_after_dashes: true })
      .option("--kind <kind>", `${WALLET_KINDS.join(", ")}; bank when left out`)
      .option("--institution <text>", "the bank or other company that holds it, by name"),
  )
    .description(
      "add a wallet in one currency; anyone adds one directly, and only you set its opening balance, with wallets update",
    )
    .summary("add a bank account, card or cash wallet")
    .argument("<name>", "what you call it, such as 'Main card'")
    .argument("<currency>", "ISO 4217, such as RUB; a bank account in two currencies is two wallets")
    .action((name: string, currency: string, options: { kind?: string; institution?: string; json?: boolean }) =>
      run(options.json, async (store) =>
        itemAnswer(
          await store.wallets.add({
            by: authorOf(env),
            name,
            currency,
            ...given({
              kind: optionalChoice(options.kind, WALLET_KINDS, "--kind"),
              institution: options.institution,
            }),
          }),
        ),
      ),
    )

  json(
    byOption(
      annotate(wallets.command("update"), { effects: LOCAL_WRITE, output: { entity: "wallet" } })
        .option("--title <title>", "its new name")
        .option("--institution <text>", "the bank or other company that holds it, by name")
        .option("--opening-balance <decimal>", "what it held on --opening-date, such as 1500.50; only you set it")
        .option("--opening-date <date>", "the day of the opening balance, YYYY-MM-DD"),
    ),
  )
    .description(
      "rename a wallet, or set the opening balance its balance counts from; the opening balance is yours alone, an " +
        "agent is refused",
    )
    .summary("rename a wallet or set its opening balance")
    .argument("<wallet>", "wallet:<id>")
    .action(
      async (
        ref: string,
        options: {
          title?: string
          institution?: string
          openingBalance?: string
          openingDate?: string
          asOwner?: boolean
          json?: boolean
        },
        command: Command,
      ) => {
        const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `change ${ref} as yours?` })
        await run(options.json, async (store) =>
          itemAnswer(
            await store.wallets.update(ref, {
              by,
              ...given({
                name: options.title,
                institution: options.institution,
                openingBalance: options.openingBalance,
                openingDate: dayOf(options.openingDate),
              }),
            }),
          ),
        )
      },
    )
}
