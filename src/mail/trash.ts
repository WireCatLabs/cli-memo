import { randomBytes } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { CliError, resolvePaths } from "@wirecat/cli-base"
import { type AccountKey, type EmailFacts, type MessageStore, storePath } from "@wirecat/cli-core/store"
import type { MailAccountConfig } from "./accounts.js"
import { BULK } from "./bulk.js"
import { factsOf } from "./facts.js"
import type { MailAccount } from "./import.js"
import { decide, describeMatch, ENVELOPE, type MailRule } from "./rules.js"
import type { Listed, MailSource } from "./source.js"

export const ALL_MAIL = "[Gmail]/All Mail"
export const TRASH = "[Gmail]/Trash"
const DAY = 86_400_000
/** Gmail deletes Trash for good after 30 days (support.google.com/mail/answer/7401). */
export const RESTORE_DAYS = 30
const MIN_AGE_DAYS = 30
const BACKUP_DAYS = 8
const FIRST_RUN_LIMIT = 100
export const DEFAULT_LIMIT = 5_000
const BATCH = 500

/** Labels Gmail sets itself; any other label on a message is the owner's, and keeps it out of the trash. */
const SYSTEM_LABELS = new Set(["Inbox", "Important", "Starred", "Sent", "Drafts", "Spam", "Trash"])

export type KeptReason =
  | "no_rule"
  | "protected"
  | "rule_changed"
  | "replied"
  | "starred"
  | "sent"
  | "labelled"
  | "too_new"

export interface RuleTotals {
  rule: string
  candidates: number
  bytes: number
  kept: Partial<Record<KeptReason, number>>
}

export interface ArchiveCheck {
  /** The weekly store backup's marker, written by the backup script when a copy passed its check. */
  backup: { at: string | null; fresh: boolean; marker: string }
  /** Advised by the owner, not required: a Takeout mbox of the mailbox, imported with the mbox source. */
  takeout: { imported: boolean; advised: string }
  ok: boolean
}

export interface TrashResult {
  account: string
  run: string | null
  applied: boolean
  /** Envelopes in the store for this account. */
  envelopes: number
  candidates: number
  bytes: number
  trashed: number
  not_moved: number
  /** Picked envelopes Gmail's All Mail no longer holds: already deleted or trashed by hand. Counted by `--yes`. */
  gone: number
  kept: Partial<Record<KeptReason, number>>
  limit: number
  first_run: boolean
  archive: ArchiveCheck
  rules: RuleTotals[]
}

interface LogLine {
  type: "run" | "email" | "batch" | "end" | "restore"
  [key: string]: unknown
}

const logDir = (env: NodeJS.ProcessEnv, account: string) =>
  join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).state, "mail-trash", account)

const readLog = (path: string): LogLine[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogLine]
      } catch {
        return []
      }
    })

export interface TrashRun {
  id: string
  started_at: string
  ended_at: string | null
  trashed: number
  restored: number
  /** Gmail empties Trash 30 days after a move; a restore after that finds nothing. */
  restorable_until: string
}

/** The account's cleanup runs, newest first, from their restore logs. */
export const trashRuns = (env: NodeJS.ProcessEnv, account: string): TrashRun[] => {
  const dir = logDir(env, account)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => {
      const lines = readLog(join(dir, name))
      const start = lines.find(({ type }) => type === "run")
      const end = lines.find(({ type }) => type === "end")
      const started = String(start?.started_at ?? "")
      return {
        id: name.replace(/\.jsonl$/, ""),
        started_at: started,
        ended_at: end ? String(end.ended_at) : null,
        trashed: lines
          .filter(({ type }) => type === "batch")
          .reduce((sum, line) => sum + (line.moved as string[]).length, 0),
        restored: lines
          .filter(({ type }) => type === "restore")
          .reduce((sum, line) => sum + (line.restored as string[]).length, 0),
        restorable_until: new Date(Date.parse(started) + RESTORE_DAYS * DAY).toISOString(),
      }
    })
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
}

export const backupMarker = (env: NodeJS.ProcessEnv) => join(dirname(storePath(env)), "backups", "last.json")

export const archiveCheck = (
  env: NodeJS.ProcessEnv,
  account: MailAccountConfig,
  accounts: readonly MailAccountConfig[],
  now: number,
): ArchiveCheck => {
  const marker = backupMarker(env)
  let at: string | null = null
  try {
    const value = (JSON.parse(readFileSync(marker, "utf8")) as { at?: unknown }).at
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) at = value
  } catch {}
  const fresh = at !== null && now - Date.parse(at) < BACKUP_DAYS * DAY
  const imported = accounts.some(
    ({ mode, address }) => mode === "mbox" && address.toLowerCase() === account.address.toLowerCase(),
  )
  return {
    backup: { at, fresh, marker },
    takeout: {
      imported,
      advised: imported
        ? "a Takeout mbox of this mailbox is imported"
        : "advised: export the mailbox with Google Takeout and import its mbox, so the full text of trashed mail is kept",
    },
    ok: fresh,
  }
}

const userLabels = (item: Listed) => (item.labels ?? []).filter((label) => !SYSTEM_LABELS.has(label))

type StoredMail = Listed & { envelope: boolean }

/** A stored email in the shape a Gmail listing has; it has no UID until Gmail is asked. */
const listedOf = (email: EmailFacts): StoredMail => {
  const labels = email.mailboxes.filter(({ kind }) => kind === "label").map(({ name }) => name)
  if (email.flagged && !labels.includes("Starred")) labels.push("Starred")
  return {
    uid: "",
    messageId: email.externalId,
    threadId: "",
    receivedAt: new Date(email.receivedAt ?? 0).toISOString(),
    labels: labels.sort(),
    seen: email.read,
    flagged: email.flagged,
    ...(email.size === null ? {} : { size: email.size }),
    headers: {
      ...(email.fromAddress === null ? {} : { from: email.fromAddress }),
      ...(email.fromName === null ? {} : { fromName: email.fromName }),
      ...(email.subject === null ? {} : { subject: email.subject }),
      ...(email.listId === null ? {} : { listId: email.listId }),
      to: email.recipients,
      bulk: email.mailboxes.some(({ kind }) => kind === BULK),
    },
    envelope: email.mailboxes.some(({ kind }) => kind === ENVELOPE),
  }
}

/** Why an envelope stays in Gmail, or undefined when the cleanup may trash it. */
const keptBecause = (
  item: Listed,
  rule: MailRule | undefined,
  replied: ReadonlySet<string>,
  now: number,
): KeptReason | undefined => {
  if (rule === undefined) return "no_rule"
  if (rule.protected || rule.action === "keep") return "protected"
  if (rule.action !== ENVELOPE && rule.action !== "skip") return "rule_changed"
  const from = item.headers?.from
  if (from !== undefined && replied.has(from)) return "replied"
  const labels = item.labels ?? []
  if (item.flagged || labels.includes("Starred") || labels.includes("Important")) return "starred"
  if (labels.includes("Sent") || labels.includes("Drafts")) return "sent"
  if (userLabels(item).some((label) => !rule.tags?.includes(label))) return "labelled"
  if (now - Date.parse(item.receivedAt) < MIN_AGE_DAYS * DAY) return "too_new"
  return undefined
}

const count = (into: Partial<Record<KeptReason, number>>, reason: KeptReason) => {
  into[reason] = (into[reason] ?? 0) + 1
}

/**
 * Moves the account's envelopes to Gmail's Trash, after deciding each one again with today's rules and labels.
 * Without `apply` it only counts. Every moved email is written to the run's restore log before its batch is sent.
 */
export const trashMail = async ({
  store,
  source,
  account,
  accounts,
  env,
  apply,
  limit = DEFAULT_LIMIT,
  now = Date.now,
}: {
  store: MessageStore
  source: MailSource
  account: MailAccount & MailAccountConfig
  accounts: readonly MailAccountConfig[]
  env: NodeJS.ProcessEnv
  apply: boolean
  limit?: number
  now?: () => number
}): Promise<TrashResult> => {
  const started = now()
  const key: AccountKey = { provider: "email", account: account.address.toLowerCase() }
  const firstRun = trashRuns(env, account.name).every(({ trashed }) => trashed === 0)
  const cap = firstRun ? Math.min(limit, FIRST_RUN_LIMIT) : limit
  const archive = archiveCheck(env, account, accounts, started)
  const result: TrashResult = {
    account: key.account,
    run: null,
    applied: apply,
    envelopes: 0,
    candidates: 0,
    bytes: 0,
    trashed: 0,
    not_moved: 0,
    gone: 0,
    kept: {},
    limit: cap,
    first_run: firstRun,
    archive,
    rules: [],
  }
  if (source.move === undefined)
    throw new CliError("validation_error", `mail account ${account.name} is not a Gmail account`, {
      reason: "mail.not-gmail",
    })
  const stored = await store.storedAccount(key).catch(() => null)
  if (stored === null) return result
  // Decided from the store, as the last import left it; only the emails about to move are read from Gmail again.
  const facts = (await store.mail.emailFacts({ accountId: stored.id })).map(listedOf)
  const envelopes = facts.filter(({ envelope }) => envelope)
  result.envelopes = envelopes.length
  if (envelopes.length === 0) return result

  const replied = new Set(
    facts.filter(({ labels }) => labels?.includes("Sent")).flatMap(({ headers }) => headers?.to ?? []),
  )
  const rules = account.rules ?? []
  const factsFor = factsOf(facts, rules)
  const totals = new Map<string, RuleTotals>()
  const totalsOf = (rule: MailRule | undefined) => {
    const name = rule === undefined ? "(no rule)" : describeMatch(rule.match)
    const found = totals.get(name) ?? { rule: name, candidates: 0, bytes: 0, kept: {} }
    totals.set(name, found)
    return found
  }
  const chosen: { item: Listed; rule: MailRule }[] = []
  for (const item of envelopes) {
    const rule = decide(rules, factsFor(item))
    const reason = keptBecause(item, rule, replied, started)
    const totalsForRule = totalsOf(rule)
    if (reason !== undefined) {
      count(result.kept, reason)
      count(totalsForRule.kept, reason)
      continue
    }
    totalsForRule.candidates++
    totalsForRule.bytes += item.size ?? 0
    result.candidates++
    result.bytes += item.size ?? 0
    chosen.push({ item, rule: rule as MailRule })
  }
  result.rules = [...totals.values()].sort((a, b) => b.candidates - a.candidates)
  if (!apply) return result
  if (!archive.ok)
    throw new CliError(
      "validation_error",
      archive.backup.at === null
        ? `no store backup is recorded at ${archive.backup.marker}; run the backup first`
        : `the newest store backup is from ${archive.backup.at}, older than ${BACKUP_DAYS} days; run the backup first`,
      { reason: "mail.archive-unverified" },
    )

  const id = `${new Date(started).toISOString().replace(/[:.]/g, "-")}-${randomBytes(2).toString("hex")}`
  const dir = logDir(env, account.name)
  mkdirSync(dir, { recursive: true })
  const log = join(dir, `${id}.jsonl`)
  const write = (line: LogLine) => appendFileSync(log, `${JSON.stringify(line)}\n`, { mode: 0o600 })
  write({ type: "run", id, account: key.account, started_at: new Date(started).toISOString(), limit: cap })
  result.run = id

  // The store lists oldest first.
  const picked = chosen.slice(0, cap)
  for (let from = 0, batch = 1; from < picked.length; from += BATCH, batch++) {
    const part = picked.slice(from, from + BATCH)
    const live = new Map(
      (
        (await source.find?.(
          part.map(({ item }) => item.messageId),
          ALL_MAIL,
        )) ?? []
      ).map((item) => [item.messageId, item]),
    )
    const ready: { item: Listed; rule: MailRule }[] = []
    for (const { item, rule } of part) {
      const inGmail = live.get(item.messageId)
      if (inGmail === undefined) {
        result.gone++
        continue
      }
      // Labels and stars as Gmail holds them now; sender and list as the import stored them.
      const current = {
        ...item,
        uid: inGmail.uid,
        labels: inGmail.labels ?? item.labels ?? [],
        flagged: inGmail.flagged === true,
      }
      const reason = keptBecause(current, rule, replied, started)
      if (reason === undefined) ready.push({ item: current, rule })
      else count(result.kept, reason)
    }
    if (ready.length === 0) continue
    for (const { item, rule } of ready)
      write({
        type: "email",
        batch,
        message_id: item.messageId,
        labels: item.labels ?? [],
        flagged: item.flagged === true,
        rule: describeMatch(rule.match),
      })
    const uids = new Map(ready.map(({ item }) => [item.messageId, item.uid]))
    const ids = [...uids.keys()]
    await source.move(ids, ALL_MAIL, TRASH, uids)
    // Gmail answered OK; a message still in All Mail was not moved, and gets one more try.
    let left = await stillThere(source, uids)
    if (left.length) {
      await source.move(left, ALL_MAIL, TRASH, new Map(left.map((id) => [id, uids.get(id) as string])))
      left = await stillThere(source, new Map(left.map((id) => [id, uids.get(id) as string])))
    }
    const moved = ids.filter((id) => !left.includes(id))
    write({ type: "batch", batch, moved, not_moved: left })
    if (moved.length) await store.mail.markDeleted(stored.id, moved, now())
    result.trashed += moved.length
    result.not_moved += left.length
  }
  write({ type: "end", ended_at: new Date(now()).toISOString(), trashed: result.trashed, not_moved: result.not_moved })
  return result
}

const stillThere = async (source: MailSource, uids: ReadonlyMap<string, string>): Promise<string[]> => {
  const present = new Set(await source.present?.([...uids.values()], ALL_MAIL))
  return [...uids].filter(([, uid]) => present.has(uid)).map(([id]) => id)
}

export interface RestoreResult {
  account: string
  run: string
  applied: boolean
  /** Emails the run meant to move to Trash; only those Trash holds come back. */
  logged: number
  restored: number
  /** Logged emails Trash no longer holds: restored before, moved by hand, or deleted for good by Gmail. */
  missing: number
  expired: boolean
}

/** Gmail's own names for its system labels, as `X-GM-LABELS` takes them. */
const imapLabel = (label: string) => (SYSTEM_LABELS.has(label) ? `\\${label}` : label)

/** Moves a run's emails out of Gmail's Trash and puts back the labels they had; without `apply` it only counts. */
export const restoreRun = async ({
  source,
  env,
  account,
  run,
  apply,
  now = Date.now,
}: {
  source: MailSource
  env: NodeJS.ProcessEnv
  account: { name: string; address: string }
  run: string
  apply: boolean
  now?: () => number
}): Promise<RestoreResult> => {
  if (!/^[\w-]+$/.test(run)) throw new CliError("validation_error", "a run id is letters, digits and dashes")
  const log = join(logDir(env, account.name), `${run}.jsonl`)
  if (!existsSync(log))
    throw new CliError("not_found", `no cleanup run ${run} for ${account.name}; memo mail runs ${account.name}`, {
      reason: "mail.run-unknown",
    })
  if (source.move === undefined || source.label === undefined)
    throw new CliError("validation_error", `mail account ${account.name} is not a Gmail account`, {
      reason: "mail.not-gmail",
    })
  const lines = readLog(log)
  const started = Date.parse(String(lines.find(({ type }) => type === "run")?.started_at ?? ""))
  // Every logged email, not only those a batch line confirms: a move Gmail made but did not answer leaves none.
  const emails = lines.filter(({ type }) => type === "email")
  const movedIds = new Set(emails.map(({ message_id }) => String(message_id)))
  const result: RestoreResult = {
    account: account.address.toLowerCase(),
    run,
    applied: apply,
    logged: emails.length,
    restored: 0,
    missing: 0,
    expired: now() - started > RESTORE_DAYS * DAY,
  }
  const inTrash = new Set(
    ((await source.find?.([...movedIds], TRASH)) ?? []).map(({ messageId }) => messageId as string),
  )
  result.missing = emails.length - inTrash.size
  if (!apply || inTrash.size === 0) {
    result.restored = apply ? 0 : inTrash.size
    return result
  }
  const labelsOf = (line: LogLine) => (line.labels as string[]) ?? []
  const back = emails.filter(({ message_id }) => inTrash.has(String(message_id)))
  const toInbox = back.filter((line) => labelsOf(line).includes("Inbox")).map(({ message_id }) => String(message_id))
  const toAll = back.filter((line) => !labelsOf(line).includes("Inbox")).map(({ message_id }) => String(message_id))
  const restored: string[] = []
  for (const [ids, to] of [
    [toInbox, "INBOX"],
    [toAll, ALL_MAIL],
  ] as const)
    for (let from = 0; from < ids.length; from += BATCH)
      for (const id of (await source.move(ids.slice(from, from + BATCH), TRASH, to)).moved) restored.push(id)
  // Gmail kept the owner's labels through the move on the test account; they are put back anyway, grouped by set.
  const bySet = new Map<string, string[]>()
  for (const line of back) {
    const labels = labelsOf(line).filter((label) => label !== "Inbox")
    if (labels.length === 0) continue
    const setKey = JSON.stringify(labels.map(imapLabel).sort())
    bySet.set(setKey, [...(bySet.get(setKey) ?? []), String(line.message_id)])
  }
  for (const [setKey, ids] of bySet) await source.label(ids, ALL_MAIL, JSON.parse(setKey) as string[])
  appendFileSync(log, `${JSON.stringify({ type: "restore", at: new Date(now()).toISOString(), restored })}\n`)
  result.restored = restored.length
  return result
}
