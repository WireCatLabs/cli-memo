import { CliError, createRenderer, type Streams } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { type Config, loadConfig } from "../config.js"
import { positive } from "../options.js"
import { withImportLock } from "../run/lock.js"
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
  program
    .command("mail")
    .description("Read one mail account through Himalaya into the shared message store")
    .usage("<account> import [options]")
    .argument("[account]", "the account's name in mail.accounts of the config, also its name in Himalaya")
    .argument("[action]", "import: read the account's mail, and drop the text of mail deleted at the source")
    .option("--since <date>", "first day to read, YYYY-MM-DD (default: 30 days ago)", day)
    .option("--max <n>", "most new messages to read in this run", positive, 200)
    .option("--json", "print JSON")
    .option("--no-embed", "skip semantic embedding; local words remain searchable")
    .option("--retry-attachments", "reread bounded stored messages after installing an extraction engine")
    .action(
      async (
        name: string | undefined,
        action: string | undefined,
        options: {
          since?: Date
          max: number
          json?: boolean
          embed: boolean
          retryAttachments?: boolean
        },
      ) => {
        const mailConfig = loadConfig(env).mail
        const account = chooseAccount(mailConfig?.accounts ?? [], name)
        if (action !== "import")
          throw new CliError(
            "validation_error",
            `memo mail ${account.name} takes import: memo mail ${account.name} import`,
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
