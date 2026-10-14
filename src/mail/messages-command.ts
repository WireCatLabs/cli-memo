import { CliError, type Streams } from "@wirecat/cli-base"
import { parseLocator } from "@wirecat/cli-core"
import { readMail } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { whole } from "../options.js"
import { printAtDetail } from "../output.js"
import { found } from "../search/command.js"

export const messagesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const messages = program.command("messages").description("stored emails; tg and max read messenger messages")
  messages
    .command("show")
    .description("one stored email, whole, and the emails of its thread around it")
    .argument("<message>", "the email's msg:email/… reference, as search answers give it")
    .option("--before-n <n>", "also this many earlier emails of its thread", whole, 0)
    .option("--after-n <n>", "also this many later emails of its thread", whole, 0)
    .option("--json", "print JSON")
    .action(async (reference: string, options: { json?: boolean; beforeN: number; afterN: number }) => {
      if (parseLocator(reference).provider !== "email")
        throw new CliError("validation_error", `${reference} is not an email; tg and max show messenger messages`)
      const store = await openStore({ env })
      try {
        const emails = await readMail(store, reference, { before: options.beforeN, after: options.afterN })
        if (options.json) printAtDetail(streams, options.beforeN || options.afterN ? { items: emails } : emails[0])
        else streams.data(`${emails.map((email) => found(email, "full")).join("\n\n")}\n`)
      } finally {
        await store.close()
      }
    })
}
