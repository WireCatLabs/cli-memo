import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { dateWindow, REMOTE_READ } from "@wirecat/cli-core/cli"
import type { Listed } from "@wirecat/cli-core/mail"
import {
  domainsToAge,
  FREE_MAIL,
  mailFolders,
  type Probe,
  probeMail,
  SCORE_RULE,
  SUGGEST_RULE,
} from "@wirecat/cli-core/mail"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { type Config, loadConfig } from "../config.js"
import { positive } from "../options.js"
import { type MailAccountConfig, mailAccounts, mailSource } from "./accounts.js"
import { knownAges, lookUpAges } from "./domain-age.js"
import { movedToMailCommands } from "./moved.js"
import { mailSetupCommand } from "./setup-command.js"

const accountOf = (config: Config, name: string): MailAccountConfig =>
  mailAccounts(config.mail?.accounts ?? [], [name])[0] as MailAccountConfig

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
const percent = (value: number | null) => (value === null ? "?" : `${Math.round(value * 100)}%`)

const probeText = (probe: Probe & { seconds: number }): string => {
  const rows = probe.items.map((group) => [
    String(group.emails),
    megabytes(group.bytes),
    percent(group.unread),
    percent(group.bulk),
    group.firstYear === group.lastYear ? String(group.firstYear) : `${group.firstYear}-${group.lastYear}`,
    group.replied ? "yes" : "no",
    group.suggest ?? "",
    String(group.score),
    group.listId === null ? (group.from ?? "") : `${group.listId} (${group.from ?? "?"})`,
  ])
  const header = ["emails", "MB", "unread", "bulk", "years", "replied", "suggest", "score", "sender or list"]
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)))
  const line = (row: string[]) =>
    row
      .map((cell, column) => (column < 2 ? cell.padStart(widths[column] ?? 0) : cell.padEnd(widths[column] ?? 0)))
      .join("  ")
      .trimEnd()
  return [
    `${probe.emails} emails, ${megabytes(probe.bytes)} MB, ${probe.groups} groups; ${probe.sent} sent, ` +
      `${probe.withoutHeaders} without readable headers; ${probe.seconds}s`,
    line(header),
    ...rows.map(line),
    ...(probe.presets.length
      ? [
          "",
          "kinds this mail would match (mail <profile> rules add --kind <kind> --do envelope):",
          ...probe.presets.map(
            ({ preset, emails, groups, bytes }) =>
              `  ${preset.padEnd(12)}${emails} emails, ${groups} groups, ${megabytes(bytes)} MB`,
          ),
        ]
      : []),
  ].join("\n")
}

export const mailCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const mail = program.command("mail").description("look at a mail account before importing it")
  mailSetupCommand(mail, streams, env)

  annotate(mail.command("inspect"), { effects: REMOTE_READ })
    .description("group an account's mail by sender and list, to decide what to keep or skip")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--since-time <time>", "only mail from this time, ISO 8601 or 30d ago (default: all mail)")
    .option("--limit <n>", "show this many of the largest groups", positive, 50)
    .option(
      "--domain-age",
      "ask each shown sender domain's registry when it was registered (RDAP); tells each registry its domain",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nRead-only and headers only: about 1 KB per email (From, To, Cc, Reply-To, List-Id, List-Unsubscribe, " +
        "Precedence and Gmail's SPF, DKIM and DMARC verdicts), against Gmail's daily download limit. An mbox " +
        "account reads the whole file once.\n\n" +
        `Each group's ${SUGGEST_RULE}. Its ${SCORE_RULE}. The owner decides; mail <profile> rules add adds a rule.\n\n` +
        "--domain-age asks the registry of each shown group's sender domain, one a second, and keeps the answer " +
        "on this computer for good. Big mailbox providers and senders the owner replied to are never asked; " +
        "most country domains (.ru, .de, .es, .io) have no RDAP and stay unknown. Without it, only ages " +
        "already kept are used and nothing leaves this computer.",
    )
    .action(
      async (name: string, options: { sinceTime?: string; limit: number; domainAge?: boolean; json?: boolean }) => {
        const account = accountOf(loadConfig(env), name)
        const window = dateWindow({ sinceTime: options.sinceTime })
        const since = new Date(window.since ?? 0)
        const started = Date.now()
        const source = mailSource(account, env)
        const listed = new Map<string, Listed>()
        for (const folder of await mailFolders(account, source))
          for (const item of await source.list(since, folder, { headers: true })) listed.set(item.messageId, item)
        const items = [...listed.values()]
        let probe = probeMail(items, options.limit, knownAges(env))
        let lookups: { looked: number; failed: number } | undefined
        if (options.domainAge) {
          lookups = await lookUpAges(env, domainsToAge(probe.items, FREE_MAIL))
          probe = probeMail(items, options.limit, knownAges(env))
        }
        const shown = {
          ...probe,
          ...(lookups === undefined ? {} : { domainLookups: lookups }),
          seconds: Math.round((Date.now() - started) / 100) / 10,
        }
        print(options.json, itemAnswer(shown, { meta: window.meta }), probeText(shown))
      },
    )

  movedToMailCommands(mail)
}
