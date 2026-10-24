import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { grantsAuthority, LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { loadConfig } from "../config.js"
import { collect, oneOf } from "../options.js"

interface Options {
  kind: "gmail" | "imap"
  folder?: string[]
  json?: boolean
}

export const mailSetupCommand = (mail: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(mail, streams, env)
  grantsAuthority(
    annotate(mail.command("add"), {
      effects: LOCAL_WRITE,
      examples: ["memo mail add work you@example.test --kind imap"],
    }),
  )
    .description("add an explicit account after matching its Himalaya email")
    .argument("[account]", "one Himalaya account name; omission lists choices and changes nothing")
    .argument("[address]", "must match the email configured for this Himalaya account")
    .option("--kind <kind>", "gmail or imap", oneOf(["gmail", "imap"] as const), "gmail")
    .option("--folder <folder>", "mail folder to import; repeat for several", collect)
    .option("--json", "print the added account as JSON")
    .action(async (account: string | undefined, address: string | undefined, given: Options) => {
      const { addMailAccount } = await import("./setup.js")
      print(
        given.json,
        itemAnswer(
          await addMailAccount(env, {
            ...(account ? { name: account } : {}),
            ...(address ? { address } : {}),
            mode: given.kind,
            ...(given.folder ? { folders: given.folder } : {}),
          }),
        ),
      )
    })
  annotate(mail.command("check"), { effects: LOCAL_READ, examples: ["memo mail check work"] })
    .description("check one Memo account against Himalaya's configured identity")
    .argument("[account]", "one Memo account name; omission lists choices and changes nothing")
    .option("--json", "print the checked account as JSON")
    .action(async (account: string | undefined, given: { json?: boolean }) => {
      const accounts = loadConfig(env).mail?.accounts ?? []
      const saved = accounts.find((one) => one.name === account)
      if (!saved)
        throw new CliError(
          "validation_error",
          `name one Memo account explicitly; choices: ${accounts.map((one) => one.name).join(", ") || "none"}`,
        )
      const { checkMailAccount } = await import("./setup.js")
      print(given.json, itemAnswer(await checkMailAccount(env, { name: saved.name, address: saved.address })))
    })
}
