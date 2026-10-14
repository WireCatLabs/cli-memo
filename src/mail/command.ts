import { readFileSync } from "node:fs"
import { CliError, type Streams } from "@wirecat/cli-base"
import { momentOf } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { type Config, loadConfig } from "../config.js"
import { positive } from "../options.js"
import { withImportLock } from "../run/lock.js"
import { type MailAccountConfig, mailAccounts, mailFolders, mailSource } from "./accounts.js"
import { type ApplyResult, applyRules } from "./apply.js"
import { knownAges, lookUpAges } from "./domain-age.js"
import { domainsToAge, type Probe, probeMail, SUGGEST_RULE } from "./probe.js"
import { removeRule, ruleCounts, rulesOf, saveRule } from "./rule-store.js"
import type { MailAction, MailRule, MailRuleMatch } from "./rules.js"
import { FREE_MAIL, SCORE_RULE } from "./score.js"
import type { Listed } from "./source.js"
import { mailStatus, statusText } from "./status.js"

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
  return from !== undefined ? { from } : domain !== undefined ? { domain } : { list_id: listId as string }
}

const describe = (match: MailRuleMatch): string =>
  match.from !== undefined
    ? `from ${match.from}`
    : match.domain !== undefined
      ? `domain ${match.domain}`
      : `list-id ${match.list_id}`

interface Recorded {
  emails: number
  bytes: number
}

const ruleLine = (rule: MailRule & { recorded?: Recorded }): string =>
  [
    rule.action.padEnd(8),
    rule.protected ? "protected" : "",
    describe(rule.match),
    rule.decided_at.slice(0, 10),
    rule.recorded === undefined ? "" : `${rule.recorded.emails} emails, ${megabytes(rule.recorded.bytes)} MB`,
    rule.reason ?? "",
  ]
    .filter(Boolean)
    .join("  ")
    .trimEnd()

interface RulesFile {
  version: 1
  account: string
  rules: Omit<MailRule, "id">[]
}

const ACTIONS: readonly MailAction[] = ["skip", "envelope", "keep"]

const rulesFileOf = (text: string, path: string): MailRule[] => {
  const bad = (why: string) =>
    new CliError("validation_error", `${path}: ${why}`, { reason: "mail.rules-file-invalid" })
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw bad("not JSON")
  }
  const rules = (parsed as { rules?: unknown }).rules
  if (!Array.isArray(rules)) throw bad("no rules list; write it with memo mail rules export")
  return rules.map((raw, index) => {
    const rule = raw as Partial<MailRule>
    const match = rule.match ?? {}
    const given = [match.from, match.domain, match.list_id].filter((value) => typeof value === "string")
    if (given.length !== 1 || !ACTIONS.includes(rule.action as MailAction))
      throw bad(`rule ${index + 1} needs one of match.from, match.domain, match.list_id and an action`)
    return {
      match: matchOf({ from: match.from, domain: match.domain, listId: match.list_id }),
      action: rule.action as MailAction,
      ...(typeof rule.reason === "string" ? { reason: rule.reason } : {}),
      ...(rule.protected === true ? { protected: true } : {}),
      decided_at: typeof rule.decided_at === "string" ? rule.decided_at : new Date().toISOString(),
    }
  })
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
  ].join("\n")
}

export const mailCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const mail = program.command("mail").description("look at a mail account before importing it, and the owner's rules")

  mail
    .command("probe")
    .description("group an account's mail by sender and list, to decide what to keep or skip")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--since-time <time>", "only mail from this time, ISO 8601 or 30d ago (default: all mail)")
    .option("--limit-groups <n>", "show this many of the largest groups", positive, 50)
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
        `Each group's ${SUGGEST_RULE}. Its ${SCORE_RULE}. The owner decides; add a rule with memo mail rules add.\n\n` +
        "--domain-age asks the registry of each shown group's sender domain, one a second, and keeps the answer " +
        "on this computer for good. Big mailbox providers and senders the owner replied to are never asked; " +
        "most country domains (.ru, .de, .es, .io) have no RDAP and stay unknown. Without it, only ages " +
        "already kept are used and nothing leaves this computer.",
    )
    .action(
      async (
        name: string,
        options: { sinceTime?: string; limitGroups: number; domainAge?: boolean; json?: boolean },
      ) => {
        const account = accountOf(loadConfig(env), name)
        const since = new Date(options.sinceTime === undefined ? 0 : momentOf(options.sinceTime, "--since-time"))
        const started = Date.now()
        const source = mailSource(account, env)
        const listed = new Map<string, Listed>()
        for (const folder of mailFolders(account))
          for (const item of await source.list(since, folder, { headers: true })) listed.set(item.messageId, item)
        const items = [...listed.values()]
        let probe = probeMail(items, options.limitGroups, knownAges(env))
        let lookups: { looked: number; failed: number } | undefined
        if (options.domainAge) {
          lookups = await lookUpAges(env, domainsToAge(probe.items, FREE_MAIL))
          probe = probeMail(items, options.limitGroups, knownAges(env))
        }
        const shown = {
          ...probe,
          ...(lookups === undefined ? {} : { domainLookups: lookups }),
          seconds: Math.round((Date.now() - started) / 100) / 10,
        }
        print(options.json, itemAnswer(shown), probeText(shown))
      },
    )

  mail
    .command("status")
    .description("how far an account's import is: mail stored, recorded, and left to read")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nRead from the store only, so it answers while a sync runs. Done counts mail whose outcome is final: stored, " +
        "recorded by a rule or skipped by one. The total is the mail in the window at the last sync's search.",
    )
    .action(async (name: string, options: { json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const status = await withStore(env, (store) => mailStatus(store, account))
      print(options.json, itemAnswer(status, { meta: { accounts: [account.name] } }), statusText(status))
    })

  const rules = mail
    .command("rules")
    .description("the owner's decisions on which mail to skip or keep, by sender, domain or list")

  rules
    .command("list")
    .description("one account's rules")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText("after", "\nAn envelope rule shows how many emails it recorded and their size at the source.")
    .action(async (name: string, options: { json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const items = await withStore(env, async (store) => {
        const rules = await rulesOf(store, account, env, streams.diagnostic)
        const counts = await ruleCounts(store, account.address)
        return rules.map((rule) => {
          const recorded = rule.id === undefined ? undefined : counts.get(rule.id)
          return rule.action === "envelope" ? { ...rule, recorded: recorded ?? { emails: 0, bytes: 0 } } : rule
        })
      })
      print(options.json, wholeList("mail rules list", items), items.map(ruleLine).join("\n") || "no rules")
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
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nA keep wins over an envelope, an envelope over a skip, so --keep --from one sender overrides " +
        "--skip --domain of its domain. A skipped email is never read or stored by memo sync. An envelope " +
        "email costs no more from the mailbox than a skipped one; its subject is kept in its metadata, not in " +
        "search. Changing an envelope rule to keep, or removing it, reads those emails in full on the next sync. " +
        "Mail already stored in full stays.",
    )
    .action(
      async (
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
          decided_at: new Date().toISOString(),
        }
        const account = accountOf(loadConfig(env), name)
        const saved = await withStore(env, async (store) => {
          await rulesOf(store, account, env, streams.diagnostic)
          return saveRule(store, account.address, rule)
        })
        print(options.json, itemAnswer(saved), ruleLine(saved))
      },
    )

  rules
    .command("remove")
    .description("drop the rule for a sender, domain or list")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--from <address>", "one sender address")
    .option("--domain <domain>", "a sender domain")
    .option("--list-id <id>", "a mailing list, by its List-Id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (name: string, options: MatchOptions & { json?: boolean }) => {
      const match = matchOf(options)
      const account = accountOf(loadConfig(env), name)
      const removed = await withStore(env, async (store) => {
        await rulesOf(store, account, env, streams.diagnostic)
        return removeRule(store, account.address, match)
      })
      if (!removed)
        throw new CliError("not_found", `no rule for ${describe(match)}; memo mail rules list ${name} shows them`, {
          reason: "mail.rule-not-found",
        })
      print(options.json, itemAnswer({ removed: match }), `removed the rule for ${describe(match)}`)
    })

  rules
    .command("apply")
    .description("cut stored mail an envelope rule matches to its envelope; dry run unless --yes")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option("--since-time <time>", "only mail from this time, ISO 8601 or 30d ago (default: all mail)")
    .option("--yes", "change the store; without it, only say what would change")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nReads the account's headers from the mailbox, as memo sync does (List-Id is not stored), then drops the " +
        "text, attachments and search entries of each matching stored email and keeps its sender, date, size, " +
        "labels and subject in metadata. Mail a skip rule matches is left as stored. Nothing changes in the " +
        "mailbox. Changing a rule to keep, or removing it, reads those emails in full on the next sync.",
    )
    .action(async (name: string, options: { sinceTime?: string; yes?: boolean; json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const since = new Date(options.sinceTime === undefined ? 0 : momentOf(options.sinceTime, "--since-time"))
      const result = await withImportLock(env, () =>
        withStore(env, async (store) =>
          applyRules({
            store,
            source: mailSource(account, env),
            account: { ...account, rules: await rulesOf(store, account, env, streams.diagnostic) },
            since,
            apply: options.yes === true,
          }),
        ),
      )
      print(options.json, itemAnswer(result, { meta: { accounts: [account.name] } }), applyText(result))
    })

  rules
    .command("export")
    .description("print one account's rules as JSON, to review, keep or move elsewhere")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .addHelpText("after", "\nmemo mail rules export personal > rules.json; memo mail rules import reads it back.")
    .action(async (name: string) => {
      const account = accountOf(loadConfig(env), name)
      const rules = await withStore(env, (store) => rulesOf(store, account, env, streams.diagnostic))
      const file: RulesFile = {
        version: 1,
        account: account.address,
        rules: rules.map(({ id: _, ...rule }) => rule),
      }
      streams.data(`${JSON.stringify(file, null, 2)}\n`)
    })

  rules
    .command("import")
    .description("add the rules of a file from memo mail rules export; same match replaces")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .argument("<file>", "the file memo mail rules export wrote")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (name: string, path: string, options: { json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const rules = rulesFileOf(readFileSync(path, "utf8"), path)
      const saved = await withStore(env, async (store) => {
        await rulesOf(store, account, env, streams.diagnostic)
        const out: MailRule[] = []
        for (const rule of rules) out.push(await saveRule(store, account.address, rule))
        return out
      })
      print(options.json, wholeList("mail rules import", saved), `imported ${saved.length} rules into ${account.name}`)
    })
}
