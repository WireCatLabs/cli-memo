import { readFileSync } from "node:fs"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  answerEntity,
  dateWindow,
  grantsAuthority,
  LOCAL_READ,
  LOCAL_WRITE,
  listQuery,
  queryTerms,
  REMOTE_READ,
  REMOTE_WRITE,
  typedQuery,
  withQuery,
} from "@wirecat/cli-core/cli"
import type { Listed } from "@wirecat/cli-core/mail"
import {
  conditionKeys,
  describeMatch,
  domainsToAge,
  FREE_MAIL,
  type MailAction,
  type MailRule,
  type MailRuleMatch,
  mailFolders,
  mapProposedTags,
  PRESET_NAMES,
  type PresetName,
  type Probe,
  probeMail,
  SCORE_RULE,
  SUGGEST_RULE,
} from "@wirecat/cli-core/mail"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { type Config, loadConfig } from "../config.js"
import { oneOf, positive } from "../options.js"
import { withImportLock } from "../run/lock.js"
import { type MailAccountConfig, mailAccounts, mailSource } from "./accounts.js"
import { type ApplyResult, applyRules } from "./apply.js"
import { knownAges, lookUpAges } from "./domain-age.js"
import { importFilters } from "./filters.js"
import { MAIL_RULES_QUERY, MAIL_RUNS_QUERY, mailRule, mailRun } from "./list-queries.js"
import { ACTION_HELP, actionsOf, FILTER_HELP, filterMatch } from "./rule-query.js"
import { removeRule, ruleCounts, rulesOf, saveRule } from "./rule-store.js"
import { mailSetupCommand } from "./setup-command.js"
import { mailStatus, statusText } from "./status.js"
import {
  DEFAULT_LIMIT,
  RESTORE_DAYS,
  type RestoreResult,
  restoreRun,
  type TrashResult,
  trashMail,
  trashRuns,
} from "./trash.js"

interface MatchOptions {
  sender?: string
  domain?: string
  listId?: string
  filter?: string
  kind?: PresetName
}

const accountOf = (config: Config, name: string): MailAccountConfig =>
  mailAccounts(config.mail?.accounts ?? [], [name])[0] as MailAccountConfig

const MATCH_OPTIONS = (command: Command) =>
  command
    .option("--sender <address>", "one sender address")
    .option("--domain <domain>", "a sender domain, and its subdomains")
    .option("--list-id <id>", "a mailing list, by its List-Id")
    .option("--filter <query>", FILTER_HELP)
    .option("--kind <kind>", `a built-in kind of mail: ${PRESET_NAMES.join(", ")}`, oneOf(PRESET_NAMES))

const matchOf = (options: MatchOptions): MailRuleMatch => {
  const match: MailRuleMatch = {
    ...(options.sender === undefined ? {} : { from: options.sender }),
    ...(options.domain === undefined ? {} : { domain: options.domain }),
    ...(options.listId === undefined ? {} : { list_id: options.listId }),
    ...(options.filter === undefined ? {} : filterMatch(options.filter)),
    ...(options.kind === undefined ? {} : { preset: options.kind }),
  }
  if (conditionKeys(match).length === 0)
    throw new CliError("validation_error", "give at least one of --sender, --domain, --list-id, --filter, --kind")
  return match
}

const describe = describeMatch

interface Recorded {
  emails: number
  bytes: number
}

const ruleLine = (rule: MailRule & { recorded?: Recorded }): string =>
  [
    rule.protected ? "PROTECTED" : rule.action.padEnd(8),
    describe(rule.match),
    rule.tags?.length ? `tag ${rule.tags.join(", ")}` : "",
    rule.tags_skipped ? `tags skipped: ${Object.keys(rule.tags_skipped).join(", ")}` : "",
    rule.source === undefined ? "" : `(${rule.source})`,
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
    if (!ACTIONS.includes(rule.action as MailAction) || conditionKeys(rule.match ?? {}).length === 0)
      throw bad(`rule ${index + 1} needs at least one match condition and an action`)
    const match = rule.match as MailRuleMatch
    const unknown = conditionKeys(match).filter((key) => !CONDITIONS.includes(key))
    if (unknown.length) throw bad(`rule ${index + 1} has conditions memo does not know: ${unknown.join(", ")}`)
    return {
      match,
      action: rule.action as MailAction,
      ...(Array.isArray(rule.tags) ? { tags: rule.tags.filter((tag) => typeof tag === "string") } : {}),
      ...(typeof rule.reason === "string" ? { reason: rule.reason } : {}),
      ...(rule.protected === true ? { protected: true } : {}),
      ...(typeof rule.source === "string" ? { source: rule.source } : {}),
      decided_at: typeof rule.decided_at === "string" ? rule.decided_at : new Date().toISOString(),
    }
  })
}

const CONDITIONS: readonly (keyof MailRuleMatch)[] = [
  "from",
  "domain",
  "list_id",
  "subject",
  "older_than_days",
  "larger_than_bytes",
  "has_attachments",
  "label",
  "unread",
  "bulk",
  "score_at_least",
  "preset",
]

const applyText = (result: ApplyResult): string =>
  [
    ...result.rules
      .filter(({ emails }) => emails > 0)
      .map(({ rule, emails, bytes }) => `${describe(rule.match)}  ${emails} emails, ${megabytes(bytes)} MB of text`),
    `${result.applied ? "cut" : "would cut"} ${result.envelopes} emails to envelopes, ` +
      `${megabytes(result.bytes)} MB of text, of ${result.listed} listed; ` +
      `${result.skipMatched} match only a skip rule and stay as stored; ` +
      `${result.protectedKept} are protected and stay whole; ${result.applied ? "tagged" : "would tag"} ${result.tagged}` +
      (result.applied || result.envelopes === 0 ? "" : `; memo mail rules apply ${result.account} --yes cuts them`),
  ].join("\n")

const KEPT_WORDS: Record<string, string> = {
  no_rule: "no rule matches any more",
  protected: "protected or kept by a rule",
  rule_changed: "the rule no longer records it",
  replied: "you replied to the sender",
  starred: "starred or important",
  sent: "sent or a draft",
  labelled: "carries a label of yours",
  too_new: "under 30 days old",
}

const trashText = (result: TrashResult): string => {
  const kept = Object.entries(result.kept).map(([reason, n]) => `  ${n}  ${KEPT_WORDS[reason] ?? reason}`)
  const rows = result.rules
    .filter(({ candidates }) => candidates > 0)
    .slice(0, 30)
    .map(
      ({ rule, candidates, bytes }) =>
        `  ${String(candidates).padStart(7)}  ${megabytes(bytes).padStart(8)} MB  ${rule}`,
    )
  const { backup, takeout } = result.archive
  return [
    `${result.envelopes} envelopes stored; ${result.candidates} may go to Gmail's Trash (${megabytes(result.bytes)} MB in Gmail), ` +
      `${result.gone} are no longer in All Mail`,
    ...(rows.length ? ["by rule (largest first):", ...rows] : []),
    ...(kept.length ? ["kept in Gmail:", ...kept] : []),
    `store backup: ${backup.at === null ? `none recorded (${backup.marker})` : `${backup.at}${backup.fresh ? "" : ", too old"}`}`,
    `takeout: ${takeout.advised}`,
    result.applied
      ? `run ${result.run}: moved ${result.trashed} to Trash, ${result.not_moved} not moved; ` +
        `memo mail restore ${result.account} --run ${result.run} --yes brings them back within ${RESTORE_DAYS} days`
      : result.candidates === 0
        ? "nothing to move"
        : `memo mail delete ${result.account} --yes moves the oldest ${Math.min(result.limit, result.candidates)}` +
          (result.first_run ? " (a first run moves at most 100, to check by hand in Gmail)" : "") +
          (result.archive.ok ? "" : "; it refuses until a store backup under 8 days old is recorded"),
  ].join("\n")
}

const restoreText = (result: RestoreResult): string =>
  [
    `run ${result.run}: ${result.logged} moved to Trash, ${result.missing} no longer there` +
      (result.expired ? ` (over ${RESTORE_DAYS} days: Gmail has deleted them for good)` : ""),
    result.applied
      ? `restored ${result.restored}`
      : `memo mail restore ${result.account} --run ${result.run} --yes moves ${result.restored} back`,
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
    ...(probe.presets.length
      ? [
          "",
          "kinds this mail would match (memo mail rules add <account> --kind <kind> --do envelope):",
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
  const mail = program.command("mail").description("look at a mail account before importing it, and the owner's rules")
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
        `Each group's ${SUGGEST_RULE}. Its ${SCORE_RULE}. The owner decides; add a rule with memo mail rules add.\n\n` +
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

  annotate(mail.command("status"), { effects: LOCAL_READ })
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

  annotate(mail.command("delete"), { effects: REMOTE_WRITE })
    .description("move envelope mail to Gmail's Trash, decided again; dry run unless --yes")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .option(
      "--limit <n>",
      `most emails to move this run (default ${DEFAULT_LIMIT}; a first run moves at most 100)`,
      positive,
    )
    .option("--since-time <time>", "only mail received from this time, ISO 8601 or 30d ago; older mail stays")
    .option("--yes", "move the mail; without it, only say what would move")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nOnly mail stored as an envelope moves, and each email is decided again with today's rules and Gmail labels. " +
        "It stays when a protected or keep rule matches, you ever replied to the sender, it is starred, important, " +
        "sent or a draft, it carries a label of yours, or it is under 30 days old. Decides from what the last sync " +
        "stored, and reads only the emails about to move from Gmail again.\n\n" +
        "--yes refuses until the store backup is under 8 days old (the backup script records it), writes each " +
        "email's labels to a restore log before moving it, and moves the oldest first. Gmail deletes Trash for " +
        `good after ${RESTORE_DAYS} days; until then memo mail restore brings a run back. A Google Takeout mbox of the ` +
        "mailbox is advised, not required. Never run from the timer.",
    )
    .action(async (name: string, options: { limit?: number; sinceTime?: string; yes?: boolean; json?: boolean }) => {
      const config = loadConfig(env)
      const account = accountOf(config, name)
      const window = dateWindow({ sinceTime: options.sinceTime })
      const work = () =>
        withStore(env, async (store) =>
          trashMail({
            store,
            source: mailSource(account, env),
            account: { ...account, rules: await rulesOf(store, account, env, streams.diagnostic) },
            accounts: config.mail?.accounts ?? [],
            env,
            apply: options.yes === true,
            ...(options.limit === undefined ? {} : { limit: options.limit }),
            ...(window.since === undefined ? {} : { since: new Date(window.since) }),
          }),
        )
      const result = options.yes ? await withImportLock(env, work) : await work()
      print(options.json, itemAnswer(result, { meta: { accounts: [account.name], ...window.meta } }), trashText(result))
    })

  annotate(mail.command("restore"), { effects: REMOTE_WRITE })
    .description("move a cleanup run's mail back from Gmail's Trash; dry run unless --yes")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .requiredOption("--run <id>", "the run, as memo mail runs list lists it")
    .option("--yes", "move the mail back; without it, only say what would move")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      `\nWorks for ${RESTORE_DAYS} days after the run: Gmail then deletes its Trash for good. Mail that had the Inbox ` +
        "label goes back to the inbox, the rest to All Mail, and its labels are put back; the store counts it again, " +
        "so a later cleanup decides it under today's rules.",
    )
    .action(async (name: string, options: { run: string; yes?: boolean; json?: boolean }) => {
      const account = accountOf(loadConfig(env), name)
      const work = () =>
        withStore(env, (store) =>
          restoreRun({
            store,
            source: mailSource(account, env),
            env,
            account,
            run: options.run,
            apply: options.yes === true,
          }),
        )
      const result = options.yes ? await withImportLock(env, work) : await work()
      print(options.json, itemAnswer(result, { meta: { accounts: [account.name] } }), restoreText(result))
    })

  answerEntity(
    withQuery(
      annotate(mail.command("runs").description("an account’s cleanup runs").command("list"), { effects: LOCAL_READ })
        .description("an account's cleanup runs, how much moved, and until when restorable")
        .argument("<account>", "the account's name in mail.accounts, or its address"),
      MAIL_RUNS_QUERY,
    ),
    "memo_mail_run",
    mailRun,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((name: string, words: string[], options: { json?: boolean }) => {
      const id = queryTerms(words, MAIL_RUNS_QUERY, "mail runs list").get("id")
      const account = accountOf(loadConfig(env), name)
      const runs = trashRuns(env, account.name, id)
      print(
        options.json,
        wholeList("mail runs list", runs),
        runs.length === 0
          ? "no cleanup runs"
          : runs
              .map(
                ({ id, trashed, restored, ended_at, restorable_until }) =>
                  `${id}  moved ${trashed}, restored ${restored}${ended_at === null ? ", stopped before the end" : ""}; ` +
                  `restorable until ${restorable_until}`,
              )
              .join("\n"),
      )
    })

  const rules = mail
    .command("rules")
    .description("the owner's decisions on which mail to keep, record, skip, tag or protect")

  answerEntity(
    withQuery(
      annotate(rules.command("list"), { effects: LOCAL_READ })
        .description("one account's rules, protected ones first")
        .argument("<account>", "the account's name in mail.accounts, or its address"),
      MAIL_RULES_QUERY,
    ),
    "memo_mail_rule",
    mailRule,
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nProtected rules come first, as PROTECTED. An envelope rule shows how many emails it recorded and their " +
        "size at the source.",
    )
    .action(async (name: string, words: string[], options: { json?: boolean }) => {
      const query = listQuery(typedQuery(words), MAIL_RULES_QUERY, "mail rules list")
      const account = accountOf(loadConfig(env), name)
      const items = await withStore(env, async (store) => {
        const rules = await rulesOf(store, account, env, streams.diagnostic, query)
        const counts = await ruleCounts(store, account.address)
        return rules
          .sort((a, b) => Number(b.protected === true) - Number(a.protected === true))
          .map((rule) => {
            const recorded = rule.id === undefined ? undefined : counts.get(rule.id)
            return rule.action === "envelope" ? { ...rule, recorded: recorded ?? { emails: 0, bytes: 0 } } : rule
          })
      })
      print(options.json, wholeList("mail rules list", items), items.map(ruleLine).join("\n") || "no rules")
    })

  MATCH_OPTIONS(
    grantsAuthority(annotate(rules.command("add"), { effects: LOCAL_WRITE }))
      .description("decide mail by sender, list, subject, age, size, label or kind; repeats replace")
      .argument("<account>", "the account's name in mail.accounts, or its address"),
  )
    .requiredOption("--do <actions>", ACTION_HELP, actionsOf)
    .option("--reason <text>", "why, for the owner later")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText(
      "after",
      "\nAll conditions given must hold. A protected rule wins over every other rule and kind; then keep wins over " +
        "envelope and envelope over skip, so --do keep --sender one sender overrides --do skip --domain of its " +
        "domain; an explicit rule wins over a --kind one. A skipped email is never read or stored by memo sync. An " +
        "envelope email costs no more from the mailbox than a skipped one; its subject is kept in its metadata, not " +
        "in search. Changing an envelope rule to keep, or removing it, reads those emails in full on the next sync. " +
        "Mail already stored in full stays; memo mail rules apply cuts or tags it.\n\n" +
        "score: and --kind judge a sender by its mail in the same listing; a sync that lists only new mail judges it " +
        "from that mail. has:attachment reads Content-Type at list time: a guess, not a parse.",
    )
    .action(
      async (
        name: string,
        options: MatchOptions & { do: ReturnType<typeof actionsOf>; reason?: string; json?: boolean },
      ) => {
        const rule: MailRule = {
          match: matchOf(options),
          action: options.do.action,
          ...(options.do.tags.length ? { tags: options.do.tags } : {}),
          ...(options.do.protect ? { protected: true } : {}),
          ...(options.kind === undefined ? {} : { source: `preset:${options.kind}` }),
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

  MATCH_OPTIONS(
    grantsAuthority(annotate(rules.command("remove"), { effects: LOCAL_WRITE }))
      .description("drop the rule with exactly these conditions")
      .argument("<account>", "the account's name in mail.accounts, or its address"),
  )
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

  annotate(rules.command("apply"), { effects: LOCAL_WRITE })
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
      const window = dateWindow({ sinceTime: options.sinceTime })
      const since = new Date(window.since ?? 0)
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
      print(options.json, itemAnswer(result, { meta: { accounts: [account.name], ...window.meta } }), applyText(result))
    })

  annotate(rules.command("export"), { effects: LOCAL_READ })
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

  grantsAuthority(annotate(rules.command("import"), { effects: LOCAL_WRITE }))
    .summary("import saved rules, or preview Gmail filters")
    .description("import saved Memo rules, or preview Gmail filters with --format gmail; same match replaces")
    .argument("<account>", "the account's name in mail.accounts, or its address")
    .argument("<file>", "a Memo rules JSON file, or Takeout Filters.json with --format gmail")
    .option("--format <format>", "memo (default) or gmail", oneOf(["memo", "gmail"] as const), "memo")
    .option("--yes", "with --format gmail: add the proposed rules instead of only previewing them")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (name: string, path: string, options: { json?: boolean; format: "memo" | "gmail"; yes?: boolean }) => {
        if (options.format === "gmail") {
          const account = accountOf(loadConfig(env), name)
          const parsed = importFilters(readFileSync(path, "utf8"), path)
          const { proposal, mapping, added } = await withStore(env, async (store) => {
            const { rules: mapped, mapping } = await mapProposedTags(store, parsed.rules)
            const proposal = { ...parsed, rules: mapped }
            if (!options.yes) return { proposal, mapping, added: 0 }
            await rulesOf(store, account, env, streams.diagnostic)
            const out: MailRule[] = []
            for (const rule of proposal.rules) out.push(await saveRule(store, account.address, rule))
            return { proposal, mapping, added: out.length }
          })
          print(
            options.json,
            itemAnswer({ ...proposal, tagMapping: mapping, added }),
            [
              ...proposal.rules.map(ruleLine),
              ...mapping.map(
                ({ tag, as, why }) => `label    ${tag} → ${as} (${why === "reuse" ? "same label" : "similar label"})`,
              ),
              ...proposal.skipped.map(({ filter, why }) => `skipped  ${filter}: ${why}`),
              options.yes
                ? `added ${added} rules to ${account.name}`
                : `${proposal.rules.length} rules proposed; memo mail rules import ${name} ${path} --yes adds them`,
            ].join("\n"),
          )
          return
        }
        const account = accountOf(loadConfig(env), name)
        const rules = rulesFileOf(readFileSync(path, "utf8"), path)
        const saved = await withStore(env, async (store) => {
          await rulesOf(store, account, env, streams.diagnostic)
          const out: MailRule[] = []
          for (const rule of rules) out.push(await saveRule(store, account.address, rule))
          return out
        })
        print(
          options.json,
          wholeList("mail rules import", saved),
          `imported ${saved.length} rules into ${account.name}`,
        )
      },
    )
}
