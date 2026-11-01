import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { formatLocator, parseLocator } from "@wirecat/cli-core"
import { LOCAL_READ } from "@wirecat/cli-core/cli"
import { ATTACHMENT_CHARS, attachmentsText, hitText, showMail } from "@wirecat/cli-core/mail"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { whole } from "../options.js"
import { atDetail } from "../output.js"

export const messagesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const messages = program.command("messages").description("stored messenger messages and emails")
  annotate(messages.command("show"), { effects: LOCAL_READ })
    .description("one stored message or email whole, with optional stored neighbours")
    .argument("<message>", "the msg:provider/account/chat/message reference a search gives")
    .option("--before-n <n>", "also this many earlier emails of its thread", whole, 0)
    .option("--after-n <n>", "also this many later emails of its thread", whole, 0)
    .option(
      "--full",
      `whole attachment text, not the first ${ATTACHMENT_CHARS} characters of each, and the HTML and AMP versions of the body`,
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { json?: boolean; beforeN: number; afterN: number; full?: boolean }) => {
      const locator = parseLocator(reference)
      if (locator.provider !== "email") {
        const key = { provider: locator.provider, account: locator.account }
        const messages = await withStore(env, async (store) => {
          const message = await store.messages.message(key, locator.message, { chatId: locator.chat })
          if (!message) throw new CliError("not_found", `${reference} is not in the local store`)
          return options.beforeN || options.afterN
            ? store.messages.around(key, locator.chat, locator.message, {
                before: options.beforeN,
                after: options.afterN,
              })
            : [message]
        })
        const items = messages.map((message) => ({
          ...message,
          ref: formatLocator({ ...locator, message: message.id }),
        }))
        print(
          options.json,
          options.beforeN || options.afterN ? wholeList("messages show", items) : itemAnswer(items[0]),
        )
        return
      }
      const emails = await withStore(env, (store) =>
        showMail(store, reference, { before: options.beforeN, after: options.afterN, full: options.full === true }),
      )
      print(
        options.json,
        options.beforeN || options.afterN
          ? wholeList("messages show", atDetail(emails))
          : itemAnswer(atDetail(emails[0])),
        emails.map((email) => [hitText(email, "full"), attachmentsText(email)].filter(Boolean).join("\n")).join("\n\n"),
      )
    })
}
