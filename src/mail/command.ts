import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { openStore } from "@leemour/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { loadConfig } from "../config.js"
import { positive } from "../options.js"
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

export const mailCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const mail = program.command("mail").description("Mail, read through Himalaya into the shared message store")

  mail
    .command("import")
    .description("Read a Gmail account's All Mail into the store, and drop the text of mail deleted at the source")
    .option("--account <name>", "the account's name in Himalaya's config (default: the first in mail.accounts)")
    .option("--since <date>", "first day to read, YYYY-MM-DD (default: 30 days ago)", day)
    .option("--max <n>", "most new messages to read in this run", positive, 200)
    .option("--json", "print JSON")
    .action(async (options: { account?: string; since?: Date; max: number; json?: boolean }) => {
      const accounts = loadConfig(env).mail?.accounts ?? []
      const account =
        options.account === undefined ? accounts[0] : accounts.find(({ name }) => name === options.account)
      if (account === undefined)
        throw new CliError(
          "configuration_error",
          options.account === undefined
            ? "no mail account: add mail.accounts [{ name, address }] to the config"
            : `no mail account "${options.account}" in mail.accounts of the config`,
        )
      const store = await openStore({ env })
      try {
        const result = await importMail({
          store,
          run: himalaya(env),
          account,
          since: options.since ?? new Date(Date.now() - 30 * DAY),
          max: options.max,
        })
        if (options.json) createRenderer({ format: "json", color: false, streams }).result(result)
        else streams.data(`${text(result)}\n`)
      } finally {
        await store.close()
      }
    })
}
