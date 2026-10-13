import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import { parseLocator, resolveOutput } from "@wirecat/cli-messaging"
import { readMail } from "@wirecat/cli-messaging/services"
import { openStore } from "@wirecat/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { type Config, loadConfig } from "../config.js"
import { positive, whole } from "../options.js"
import { withImportLock } from "../run/lock.js"
import { found } from "../search/command.js"
import { himalaya } from "./himalaya.js"
import { type ImportResult, importMail } from "./import.js"

const DAY = 86_400_000

const day = (value: string): Date => {
  const date = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()))
    throw new InvalidArgumentError("a date as YYYY-MM-DD")
  return date
}

const text = (result: ImportResult): string =>
  [
    `${result.account}: ${result.listed} in All Mail since ${result.since.slice(0, 10)}, ` +
      `${result.saved} saved, ${result.alreadyStored} already stored, ${result.deleted} marked deleted.`,
    ...(result.complete ? [] : ["Not every new message was read — run it again to continue."]),
    ...(result.deletionsSkipped === undefined ? [] : [`Deletions skipped: ${result.deletionsSkipped}`]),
  ].join("\n")

const chooseAccount = (
  accounts: NonNullable<Config["mail"]>["accounts"],
  name: string | undefined,
): NonNullable<Config["mail"]>["accounts"][number] => {
  if (accounts.length === 0)
    throw new CliError("configuration_error", "no mail account: add mail.accounts [{ name, address }] to the config")
  const found = accounts.find((account) => account.name === name)
  if (found !== undefined) return found
  const choices = accounts.map((account) => account.name).join(", ")
  throw new CliError(
    name === undefined || name === "import" ? "validation_error" : "not_found",
    name === undefined || name === "import"
      ? `name the account: memo mail <account> import — mail.accounts holds ${choices}`
      : `no mail account "${name}" in mail.accounts — it holds ${choices}`,
  )
}

export const mailCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  /** One stored email of the named account, whole, with the emails of its thread asked for either side. */
  const show = async (
    account: { name: string; address: string },
    reference: string | undefined,
    options: { json?: boolean; beforeN: number; afterN: number },
  ) => {
    if (reference === undefined)
      throw new CliError("validation_error", `which email? memo mail ${account.name} show <msg:email/… reference>`)
    const { provider, account: address } = parseLocator(reference)
    if (provider !== "email" || address.toLowerCase() !== account.address.toLowerCase())
      throw new CliError("validation_error", `${reference} is not an email of ${account.name} (${account.address})`)
    const store = await openStore({ env })
    try {
      const emails = await readMail(store, reference, { before: options.beforeN, after: options.afterN })
      if (options.json)
        resolveOutput({ json: true, streams }).renderer.result(
          options.beforeN || options.afterN ? { items: emails } : emails[0],
        )
      else streams.data(`${emails.map((email) => found(email, "full")).join("\n\n")}\n`)
    } finally {
      await store.close()
    }
  }

  program
    .command("mail")
    .description("read one mail account through Himalaya into the shared message store")
    .usage("<account> import [options] | <account> show <reference> [options]")
    .argument("[account]", "the account's name in mail.accounts of the config, also its name in Himalaya")
    .argument(
      "[action]",
      "import: read the account's mail, and drop the text of mail deleted at the source; show: one stored email",
    )
    .argument("[reference]", "show: the email's msg:email/… reference, as search answers give it")
    .option("--since <date>", "first day to read, YYYY-MM-DD (default: 30 days ago)", day)
    .option("--max <n>", "most new messages to read in this run", positive, 200)
    .option("--json", "print JSON")
    .option("--no-embed", "skip semantic embedding; local words remain searchable")
    .option("--retry-attachments", "reread bounded stored messages after installing an extraction engine")
    .option("--before-n <n>", "show: also this many earlier emails of its thread", whole, 0)
    .option("--after-n <n>", "show: also this many later emails of its thread", whole, 0)
    .action(
      async (
        name: string | undefined,
        action: string | undefined,
        reference: string | undefined,
        options: {
          since?: Date
          max: number
          json?: boolean
          embed: boolean
          retryAttachments?: boolean
          beforeN: number
          afterN: number
        },
      ) => {
        const mailConfig = loadConfig(env).mail
        const account = chooseAccount(mailConfig?.accounts ?? [], name)
        if (action === "show") return show(account, reference, options)
        if (action !== "import")
          throw new CliError(
            "validation_error",
            `memo mail ${account.name} takes import or show: memo mail ${account.name} import`,
          )
        const result = await withImportLock(env, async () => {
          const store = await openStore({ env })
          try {
            return await importMail({
              store,
              run: himalaya(env),
              account,
              since: options.since ?? new Date(Date.now() - 30 * DAY),
              max: options.max,
              env,
              embed: options.embed,
              ...(mailConfig?.maxBodyChars === undefined ? {} : { maxBodyChars: mailConfig.maxBodyChars }),
              ...(mailConfig?.maxAttachmentChars === undefined
                ? {}
                : { maxAttachmentChars: mailConfig.maxAttachmentChars }),
              retryAttachments: options.retryAttachments,
            })
          } finally {
            await store.close()
          }
        })
        if (options.json) createRenderer({ format: "json", color: false, streams }).result(result)
        else streams.data(`${text(result)}\n`)
      },
    )
}
