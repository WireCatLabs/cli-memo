import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { type Config, loadConfig, updateConfig } from "../config.js"
import { positive } from "../options.js"
import { metaOf, snakeKeys } from "../output.js"
import { printing } from "../records/run.js"
import { withImportLock } from "../run/lock.js"
import { type MailAccountConfig, mailAccounts, mailFolders, mailSource } from "./accounts.js"
import { type ApplyResult, applyRules } from "./apply.js"
import { type Probe, probeMail, SUGGEST_RULE } from "./probe.js"
import { envelopeBox, type MailRule, type MailRuleMatch, sameMatch } from "./rules.js"
import type { Listed } from "./source.js"

interface MatchOptions {
  from?: string
  domain?: string
  listId?: string
}

const accountOf = (config: Config, name: string): MailAccountConfig =>
  mailAccounts(config.mail?.accounts ?? [], [name])[0] as MailAccountConfig

const matchOf = ({ from, domain, listId }: MatchOptions): MailRuleMatch => {
  const given = [from, domain, listId].filter((value) => value !== undefined)
  if (given.length !== 1) throw new CliError("validation_error", "give exactly one of --from, --domain, --list-id")
  return from !== undefined ? { from } : domain !== undefined ? { domain } : { listId: listId as string }
}

const describe = (match: MailRuleMatch): string =>
  match.from !== undefined
    ? `from ${match.from}`
    : match.domain !== undefined
      ? `domain ${match.domain}`
      : `list-id ${match.listId}`

interface Recorded {
  emails: number
  bytes: number
}

const ruleLine = (rule: MailRule & { recorded?: Recorded }): string =>
  [
    rule.action.padEnd(8),
    describe(rule.match),
    rule.decidedAt.slice(0, 10),
    rule.recorded === undefined ? "" : `${rule.recorded.emails} emails, ${megabytes(rule.recorded.bytes)} MB`,
    rule.reason ?? "",
  ]
    .filter(Boolean)
    .join("  ")
    .trimEnd()

const PAGE = 1000

/** What each envelope rule has recorded so far, read from the store; nothing is fetched from the mailbox. */
const recordedBy = async (store: MessageStore, address: string, rule: MailRule): Promise<Recorded> => {
  const account = await store.storedAccount({ provider: "email", account: address.toLowerCase() }).catch(() => null)
  const recorded = { emails: 0, bytes: 0 }
  if (account === null) return recorded
  const mailbox = envelopeBox(rule.match).externalId
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.mail.emails({ accountId: account.id, mailbox, limit: PAGE, offset })
    for (const email of page) {
      recorded.emails++
      recorded.bytes += email.size ?? 0
    }
    if (page.length < PAGE) return recorded
  }
}

const changeRules = (env: NodeJS.ProcessEnv, name: string, change: (rules: MailRule[]) => MailRule[]): MailRule[] => {
  let changed: MailRule[] = []
  updateConfig((config) => {
    const account = accountOf(config, name)
    changed = change(account.rules ?? [])
    const accounts = (config.mail?.accounts ?? []).map((each) =>
      each === account ? { ...each, rules: changed } : each,
    )
    return { ...config, mail: { ...config.mail, accounts } }
  }, env)
  return changed
}

const applyText = (result: ApplyResult): string =>
  [
    ...result.rules
      .filter(({ emails }) => emails > 0)
      .map(({ rule, emails, bytes }) => `${describe(rule.match)}  ${emails} emails, ${megabytes(bytes)} MB of text`),
    `${result.applied ? "cut" : "would cut"} ${result.envelopes} emails to envelopes, ` +
      `${megabytes(result.bytes)} MB of text, of ${result.listed} listed; ` +
      `${result.skipMatched} match only a skip rule and stay as stored` +
      (result.applied || result.envelopes === 0 ? "" : `; memo mail rules apply ${result.account} --yes cuts them`),
  ].join("\n")

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
    group.listId === null ? (group.from ?? "") : `${group.listId} (${group.from ?? "?"})`,
  ])
  const header = ["emails", "MB", "unread", "bulk", "years", "replied", "suggest", "sender or list"]
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
  ].join("\n")
}

export const mailCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const print = printing(streams)
  const mail = program.command("mail").description("look at a mail account before importing it, and the owner's rules")

  mail
    .command("probe")
    .description("group an account's mail by sender and list, to decide what to keep or skip")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--since-time <time>", "only mail from this time, ISO 8601 or 30d ago (default: all mail)")
    .option("--limit-groups <n>", "show this many of the largest groups", positive, 50)
    .option("--json", "print JSON")
    .addHelpText(
      "after",
      "\nRead-only and headers only: about 300 bytes per email (From, To, Cc, List-Id, List-Unsubscribe, " +
        "Precedence), against Gmail's daily download limit. An mbox account reads the whole file once.\n\n" +
        `Each group's ${SUGGEST_RULE}. The owner decides; add a rule with memo mail rules add.`,
    )
    .action(async (name: string, options: { sinceTime?: string; limitGroups: number; json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const since = new Date(
        options.sinceTime === undefined
          ? 0
          : (await import("@wirecat/cli-core/cli")).momentOf(options.sinceTime, "--since-time"),
      )
      const started = Date.now()
      const source = mailSource(account, env)
      const listed = new Map<string, Listed>()
      for (const folder of mailFolders(account))
        for (const item of await source.list(since, folder, { headers: true })) listed.set(item.messageId, item)
      const probe = { ...probeMail([...listed.values()], options.limitGroups), seconds: 0 }
      probe.seconds = Math.round((Date.now() - started) / 100) / 10
      print(options.json, probe, probeText(probe))
    })

  const rules = mail
    .command("rules")
    .description("the owner's decisions on which mail to skip or keep, by sender, domain or list")

  rules
    .command("list")
    .description("one account's rules")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--json", "print JSON")
    .addHelpText("after", "\nAn envelope rule shows how many emails it recorded and their size at the source.")
    .action(async (name: string, options: { json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const rules = account.rules ?? []
      const store = rules.some(({ action }) => action === "envelope") ? await openStore({ env }) : undefined
      try {
        const items: (MailRule & { recorded?: Recorded })[] = []
        for (const rule of rules)
          items.push(
            store !== undefined && rule.action === "envelope"
              ? { ...rule, recorded: await recordedBy(store, account.address, rule) }
              : rule,
          )
        print(options.json, { items }, items.map(ruleLine).join("\n") || "no rules")
      } finally {
        await store?.close()
      }
    })

  rules
    .command("add")
    .description("skip, record or keep mail by sender, domain or list; a repeat replaces its rule")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--from <address>", "one sender address")
    .option("--domain <domain>", "a sender domain, and its subdomains")
    .option("--list-id <id>", "a mailing list, by its List-Id")
    .option("--skip", "never read or store this mail")
    .option("--envelope", "store only sender, date, size and labels: counted, out of search, cleanable later")
    .option("--keep", "import this mail even when a skip or envelope rule matches it")
    .option("--reason <text>", "why, for the owner later")
    .option("--json", "print JSON")
    .addHelpText(
      "after",
      "\nA keep wins over an envelope, an envelope over a skip, so --keep --from one sender overrides " +
        "--skip --domain of its domain. A skipped email is never read or stored by memo sync. An envelope " +
        "email costs no more from the mailbox than a skipped one; its subject is kept in its metadata, not in " +
        "search. Changing an envelope rule to keep, or removing it, reads those emails in full on the next sync. " +
        "Mail already stored in full stays.",
    )
    .action(
      (
        name: string,
        options: MatchOptions & { skip?: boolean; envelope?: boolean; keep?: boolean; reason?: string; json?: boolean },
      ) => {
        const match = matchOf(options)
        const actions = (["skip", "envelope", "keep"] as const).filter((action) => options[action])
        if (actions.length !== 1)
          throw new CliError("validation_error", "give exactly one of --skip, --envelope, --keep")
        const rule: MailRule = {
          match,
          action: actions[0] as MailRule["action"],
          ...(options.reason === undefined ? {} : { reason: options.reason }),
          decidedAt: new Date().toISOString(),
        }
        changeRules(env, name, (current) => [...current.filter((each) => !sameMatch(each.match, match)), rule])
        print(options.json, rule, ruleLine(rule))
      },
    )

  rules
    .command("remove")
    .description("drop the rule for a sender, domain or list")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--from <address>", "one sender address")
    .option("--domain <domain>", "a sender domain")
    .option("--list-id <id>", "a mailing list, by its List-Id")
    .option("--json", "print JSON")
    .action((name: string, options: MatchOptions & { json?: boolean }) => {
      const match = matchOf(options)
      if (!(accountOf(loadConfig(env), name).rules ?? []).some((rule) => sameMatch(rule.match, match)))
        throw new CliError("not_found", `no rule for ${describe(match)}; memo mail rules list ${name} shows them`, {
          reason: "mail.rule-not-found",
        })
      const left = changeRules(env, name, (current) => current.filter((rule) => !sameMatch(rule.match, match)))
      print(options.json, { removed: match, items: left }, `removed the rule for ${describe(match)}`)
    })

  rules
    .command("apply")
    .description("cut stored mail an envelope rule matches to its envelope; dry run unless --yes")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--since-time <time>", "only mail from this time, ISO 8601 or 30d ago (default: all mail)")
    .option("--yes", "change the store; without it, only say what would change")
    .option("--json", "print JSON")
    .addHelpText(
      "after",
      "\nReads the account's headers from the mailbox, as memo sync does (List-Id is not stored), then drops the " +
        "text, attachments and search entries of each matching stored email and keeps its sender, date, size, " +
        "labels and subject in metadata. Mail a skip rule matches is left as stored. Nothing changes in the " +
        "mailbox. Changing a rule to keep, or removing it, reads those emails in full on the next sync.",
    )
    .action(async (name: string, options: { sinceTime?: string; yes?: boolean; json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const since = new Date(
        options.sinceTime === undefined
          ? 0
          : (await import("@wirecat/cli-core/cli")).momentOf(options.sinceTime, "--since-time"),
      )
      const startedAt = Date.now()
      const result = await withImportLock(env, async () => {
        const store = await openStore({ env })
        try {
          return await applyRules({
            store,
            source: mailSource(account, env),
            account,
            since,
            apply: options.yes === true,
          })
        } finally {
          await store.close()
        }
      })
      if (options.json)
        createRenderer({ format: "json", color: false, streams }).result({
          item: snakeKeys(result),
          meta: metaOf(startedAt, { accounts: [account.name] }),
        })
      else streams.data(`${applyText(result)}\n`)
    })
}
