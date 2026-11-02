import { CliError } from "@wirecat/cli-base"
import { overrideSharedContract } from "@wirecat/cli-core/cli"
import { type MailReads, mailReadCommands } from "@wirecat/cli-core/mail/cli"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { withStore } from "../answer.js"
import { APP } from "../app.js"
import { MAIL_SOURCES, mailboxesOf } from "../store/source-list.js"

export const MAILBOX_HELP = `the one mailbox: ${MAIL_SOURCES}; may be left out when the store holds one mailbox`

/** cli-core's mail commands read one mailbox per call; memo holds several, so the caller names it. */
export const oneMailboxOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  source: string | undefined,
): Promise<AccountKey> => {
  const mailboxes = source
    ? await mailboxesOf(store, env, source)
    : (await store.accounts.accounts()).filter((key) => key.provider === "email")
  if (mailboxes.length === 1) return mailboxes[0] as AccountKey
  const names = mailboxes.map((key) => `email:${key.account}`).join(", ")
  throw new CliError(
    "validation_error",
    names ? `give --source with one mailbox: ${names}` : "the store holds no mailbox yet; run memo sync first",
    { reason: "mail.mailbox-needed", param: "source" },
  )
}

const named = (commands: readonly Command[], name: string): Command => {
  const found = commands.find((command) => command.name() === name)
  if (!found) throw new Error(`cli-core's mail commands have no ${name}`)
  return found
}

/**
 * `memo mail review` and `memo messages acknowledge`: cli-core's, over the mailbox `--source` names. The holder read
 * and the acknowledge are what the mail-triage agent runs; acknowledge is of cli-core's propose tier, the one store
 * change MEMO_READ_ONLY lets through besides `mail findings add`.
 */
export const mailReviewCommands = (mail: Command, messages: Command, env: NodeJS.ProcessEnv): void => {
  const reads: MailReads = {
    app: APP,
    read: (command, work) =>
      withStore(env, async (store) =>
        work(store, await oneMailboxOf(store, env, command.opts<{ source?: string }>().source)),
      ),
  }
  const shared = mailReadCommands(reads)
  const review = named(shared, "review")
  const acknowledge = named(named(shared, "messages").commands, "acknowledge")
  for (const command of [review, acknowledge])
    overrideSharedContract(
      command,
      "memo holds several mailboxes and no profile, so --source names the one mailbox; its --json is per command.",
      (one) => {
        one
          .option("--source <accounts>", MAILBOX_HELP)
          .option("--json", "print JSON; --json=id,title keeps only those fields")
      },
    )
  mail.addCommand(review)
  messages.addCommand(acknowledge)
}
