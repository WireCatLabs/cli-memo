import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { CONTRACT_KINDS, CONTRACT_STATUSES, FINANCE_REVIEWS } from "@wirecat/cli-core"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { ContractFilter, MessageStore } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { positive } from "../options.js"
import { pageOf } from "../page.js"
import { withSources } from "../records/sources.js"
import { canonicalProject } from "../vocabulary/project.js"
import { dayOf } from "./finance.js"
import { choice, given, json, onOff, optionalChoice, type Written, writeMeta, writtenBy } from "./written.js"

export const CONTRACT_QUERY = {
  entity: "contract",
  backend: "native",
  fields: [
    termField("status", "enum", "status:active", { values: CONTRACT_STATUSES }),
    termField("kind", "enum", "kind:lease", { values: CONTRACT_KINDS }),
    termField("project", "kw", "project:PMED"),
    termField("review", "enum", "review:proposed", { values: FINANCE_REVIEWS }),
    termField("expires", "time", "expires:2026-12-31"),
  ],
} as const satisfies QueryRegistry

export const listContracts = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit?: number,
) => {
  const terms = queryTerms(words, CONTRACT_QUERY, "contracts list")
  const project = terms.get("project")
  const filter: ContractFilter = given({
    status: terms.get("status") as ContractFilter["status"],
    kind: terms.get("kind") as ContractFilter["kind"],
    review: terms.get("review") as ContractFilter["review"],
    expiresBy: dayOf(terms.get("expires")),
    project: project === undefined ? undefined : await canonicalProject(store, project),
  })
  return pageOf("contracts list", limit, (most) => store.contracts.list({ ...filter, limit: most }))
}

const days = (value: string): number => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) throw new InvalidArgumentError("a whole number of days, 0 or more")
  return number
}

interface ContractOptions extends Written {
  status?: string
  startDate?: string
  endDate?: string
  autoRenew?: string
  noticeDays?: number
  amount?: string
  currency?: string
}

const terms = (command: Command) =>
  command
    .option("--kind <kind>", `what it is: ${CONTRACT_KINDS.join(", ")}`)
    .option("--status <state>", `${CONTRACT_STATUSES.join(", ")}; active when left out`)
    .option("--start-date <date>", "the first day it is in force, YYYY-MM-DD")
    .option("--end-date <date>", "the last day it is in force, YYYY-MM-DD; left out, it runs until ended")
    .option("--auto-renew <on|off>", "it renews by itself at its end, or it does not")
    .option("--notice-days <days>", "how many days before its end a party must say it will not go on", days)
    .option(
      "--amount <decimal>",
      "what it is worth, such as 120000.00, in --currency; with it, an agent's waits for you",
    )
    .option("--currency <code>", "an ISO 4217 code, such as RUB")

const fieldsOf = (options: ContractOptions) =>
  given({
    status: optionalChoice(options.status, CONTRACT_STATUSES, "--status"),
    effectiveDate: dayOf(options.startDate),
    expirationDate: dayOf(options.endDate),
    autoRenew: onOff(options.autoRenew, "--auto-renew"),
    noticeDays: options.noticeDays,
    value: options.amount,
    currency: options.currency,
  })

const VALUED =
  "one with no amount is written as it is, by anyone; with an amount yours is confirmed at once and an agent's " +
  "waits as proposed for you in memo review"

/** `memo contracts`: what the owner works under, its dates, renewal and notice. */
export const contractCommands = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { run } = answers(program, streams, env)
  const contracts = program
    .command("contracts")
    .description("contracts you work under: their kind, dates, renewal, notice and what they are worth")
    .summary("contracts you work under, with their dates and notice")

  withQuery(
    json(annotate(contracts.command("list"), { effects: LOCAL_READ })).description(
      "contracts, newest first; expires:2026-12-31 lists those that end by then",
    ),
    CONTRACT_QUERY,
  )
    .option("--limit <n>", "most contracts, up to 500", positive, 100)
    .action((words: string[], { json, limit }: { limit: number; json?: boolean }) =>
      run(json, (store) => listContracts(store, words, limit)),
    )

  json(annotate(contracts.command("show"), { effects: LOCAL_READ, output: { entity: "contract" } }))
    .description("one contract with its dates, renewal and the last day to give notice")
    .argument("<contract>", "contract:<id>")
    .action((ref: string, options: { json?: boolean }, command: Command) =>
      run(options.json, async (store) => itemAnswer(await withSources(command, store, await store.contracts.get(ref)))),
    )

  json(
    writeMeta(
      terms(
        annotate(contracts.command("add"), {
          effects: LOCAL_WRITE,
          output: { entity: "contract" },
          literal_after_dashes: true,
        }),
      ),
    ),
  )
    .description(`record a contract; ${VALUED}`)
    .summary("record a contract")
    .argument("<name>", "what it is called, such as 'Rental agreement'")
    .action(async (name: string, options: ContractOptions, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: "record this contract as yours?" })
      await run(options.json, async (store) =>
        itemAnswer(
          await store.contracts.add({
            ...(await writtenBy(store, by, options)),
            name,
            kind: choice(options.kind, CONTRACT_KINDS, "--kind"),
            ...fieldsOf(options),
          }),
        ),
      )
    })

  json(
    byOption(
      terms(annotate(contracts.command("update"), { effects: LOCAL_WRITE, output: { entity: "contract" } })).option(
        "--title <title>",
        "its new name",
      ),
    ),
  )
    .description(
      "change a contract's dates, status, terms or worth; you change any, an agent only one it proposed that is " +
        "still proposed, and a confirmed contract's worth only you",
    )
    .summary("change a contract")
    .argument("<contract>", "contract:<id>")
    .action(async (ref: string, options: ContractOptions, command: Command) => {
      const by = await whoRuns(command, env, { asOwner: options.asOwner, question: `change ${ref} as yours?` })
      await run(options.json, async (store) =>
        itemAnswer(
          await store.contracts.update(ref, {
            by,
            ...fieldsOf(options),
            ...given({
              name: options.title,
              kind: optionalChoice(options.kind, CONTRACT_KINDS, "--kind"),
            }),
          }),
        ),
      )
    })
}
