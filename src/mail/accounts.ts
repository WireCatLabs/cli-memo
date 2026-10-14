import { homedir } from "node:os"
import { CliError } from "@wirecat/cli-base"
import type { Config } from "../config.js"
import { himalaya } from "./himalaya.js"
import { mboxSource } from "./mbox.js"
import { himalayaSource, type MailSource } from "./source.js"

export type MailAccountConfig = NonNullable<Config["mail"]>["accounts"][number]

/** The accounts named, by name or address; none named means every account. */
export const mailAccounts = (accounts: MailAccountConfig[], names: string[] | undefined): MailAccountConfig[] => {
  if (names === undefined) return accounts
  return names.map((name) => {
    const found = accounts.find(
      (account) => account.name === name || account.address.toLowerCase() === name.toLowerCase(),
    )
    if (found) return found
    const choices = accounts.map((account) => account.name).join(", ") || "none"
    throw new CliError("not_found", `no mail account "${name}" in mail.accounts — it holds ${choices}`, {
      reason: "mail.account-unknown",
      account: name,
    })
  })
}

export const mailFolders = (account: { mode?: string; folders?: string[] }): string[] =>
  account.folders ?? [account.mode === "imap" ? "INBOX" : "[Gmail]/All Mail"]

export const mailSource = (account: MailAccountConfig, env: NodeJS.ProcessEnv): MailSource => {
  if (account.mode !== "mbox") return himalayaSource(himalaya(env), account)
  if (account.path === undefined)
    throw new CliError("validation_error", `mail account "${account.name}" is mode mbox but names no path`)
  return mboxSource(account.path.replace(/^~(?=\/|$)/, env.HOME ?? homedir()))
}
