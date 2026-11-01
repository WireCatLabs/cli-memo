import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { NO_EFFECTS } from "@wirecat/cli-core/cli"
import type { Command } from "commander"

/** memo's old mail-writing commands and what the `mail` CLI runs instead; `<profile>` is the mailbox's profile. */
export const MOVED_TO_MAIL = [
  ["delete", "mail <profile> messages delete --rules", "previews; --yes moves the mail to Trash"],
  ["restore", "mail <profile> messages restore --run <id>", "memo's run ids work there"],
  [
    "runs list",
    "mail doctor",
    "it names the cleanup runs, memo's included, that stopped part way or whose Gmail Trash empties soon; every run " +
      "is a file <id>.jsonl in memo's state folder under mail-trash/<profile>/, and messages restore --run <id> takes it",
  ],
  ["rules list", "mail <profile> rules list", ""],
  ["rules add", "mail <profile> rules add", "same options, no account argument"],
  ["rules remove", "mail <profile> rules remove", "same options, no account argument"],
  ["rules apply", "mail <profile> rules apply", "same options, no account argument"],
  ["rules export", "mail <profile> rules export", ""],
  ["rules import", "mail <profile> rules import <file>", "same options, no account argument"],
] as const

const PROFILES = "mail session list lists the profiles and the address each one holds"

export const movedMessage = (from: string, to: string, note: string): string =>
  `memo mail ${from} moved to the mail CLI: run ${to}${note ? ` (${note})` : ""}; ${PROFILES}`

// WC-CMD-8 forbids aliases: the old paths stay, hidden from help, discovery and MCP, only to say where they went.
export const movedToMailCommands = (mail: Command): void => {
  const groups = new Map<string, Command>()
  for (const [from, to, note] of MOVED_TO_MAIL) {
    const words = from.split(" ")
    const name = words.pop() as string
    const group = words[0]
    let parent = mail
    if (group !== undefined) {
      parent = groups.get(group) ?? mail.command(group, { hidden: true }).description("moved to the mail CLI")
      groups.set(group, parent)
    }
    annotate(parent.command(name, { hidden: true }), { effects: NO_EFFECTS })
      .description(`moved to the mail CLI: ${to}`)
      .argument("[args...]", "ignored; the command changes nothing")
      .allowUnknownOption()
      .allowExcessArguments()
      .action(() => {
        throw new CliError("validation_error", movedMessage(from, to, note), {
          reason: "mail.moved-to-mail-cli",
          cli: "mail",
          alternative: to,
        })
      })
  }
}
