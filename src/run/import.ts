import { type ErrorCode, errorCodes, isCliError, type Streams } from "@wirecat/cli-base"
import { momentOf } from "@wirecat/cli-core/cli"
import { openStore } from "@wirecat/cli-core/store"
import { type Command, Option } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { loadConfig } from "../config.js"
import { errorObject } from "../failure.js"
import { mailAccounts, mailSource } from "../mail/accounts.js"
import { type ImportResult, importMail } from "../mail/import.js"
import { rulesOf } from "../mail/rule-store.js"
import { boundFolders, unboundReason } from "../notes/bound.js"
import { embedNoteChunks, type NoteChunksEmbedded } from "../notes/embed.js"
import { noteFolders } from "../notes/folders.js"
import { importNotes, type NotesImport } from "../notes/import.js"
import { collect, positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { applyAuto, autoState, recordAutoRun } from "./auto.js"
import { withImportLock } from "./lock.js"

const DAY = 86_400_000
const MAIL_WINDOW_DAYS = 30
const LARGE_IMPORT_HELP =
  "Large first import: mail is read at about 10 emails (~1 MB) a second, and Gmail caps IMAP downloads " +
  "(2,500 MB a day for Workspace, https://knowledge.workspace.google.com/admin/gmail/gmail-bandwidth-limits; " +
  "the consumer limit is not published), so a mailbox of many GB takes days: raise --limit gradually and let " +
  "each run continue where the last stopped.\n\n" +
  "Resuming: a run lists only the mail no earlier run finished, so a large mailbox is not listed again each " +
  "time. A whole listing, which marks deleted mail and refreshes labels and read state, runs at least once a " +
  "day, after any change to the rules, and with --rescan.\n\n" +
  "Rules: an email a skip rule of `memo mail rules` matches is never read or stored, and is counted as " +
  "skipped; mail stored before the rule stays.\n\n" +
  "An mbox account (a Google Takeout file, mode mbox) syncs only when named with --account: each run reads " +
  "the whole file, its mail is old so it needs a --since-time far back, and a large --limit. It only adds " +
  "mail; nothing missing from the file is marked deleted."

// An unexpected crash has no standard code to name it by; it still leaves the answer incomplete.
const issuesOf = (failed: ImportRun["failed"]) =>
  failed.flatMap(({ code, source }) =>
    (errorCodes as readonly string[]).includes(code) ? [{ code: code as ErrorCode, source }] : [],
  )

export interface ImportRun {
  notes: NotesImport[]
  /** The notes' chunks embedded for search by meaning this run. */
  notesEmbedded?: NoteChunksEmbedded
  mail: ImportResult[]
  /** A source that failed; the others still ran. */
  failed: { source: string; code: ErrorCode | "internal_error"; reason: string }[]
  /** Why a timer run did nothing: another sync held the lock. */
  skipped?: string
}

const text = (run: ImportRun): string =>
  [
    ...run.notes.map(
      (n) =>
        `notes ${n.folder}: ${n.notes} notes, ${n.changed} changed, ${n.renamed} moved, ${n.deleted} gone` +
        (n.deletionsSkipped === undefined ? "" : ` — deletions skipped: ${n.deletionsSkipped}`),
    ),
    ...(run.notesEmbedded === undefined
      ? []
      : [
          `notes by meaning: ${run.notesEmbedded.chunks} chunks embedded` +
            (run.notesEmbedded.notEmbedded !== undefined
              ? ` — ${run.notesEmbedded.notEmbedded}`
              : run.notesEmbedded.left
                ? " — more next run"
                : ""),
        ]),
    ...run.mail.map(
      (m) =>
        `mail ${m.account}: ${m.listed} listed${m.pass === "resumed" ? " (resumed)" : ""}, ${m.saved} new, ` +
        `${m.deleted} gone` +
        (m.envelopes ? `, ${m.envelopes} recorded as envelopes` : "") +
        (m.skipped ? `, ${m.skipped} skipped by rule` : "") +
        (m.complete ? "" : " — more to read next run") +
        (m.unreadable === undefined ? "" : ` — ${m.unreadable.length} unreadable, tried again next run`) +
        (m.deletionsSkipped === undefined ? "" : ` — deletions skipped: ${m.deletionsSkipped}`),
    ),
    ...run.failed.map(({ source, reason }) => `failed ${source}: ${reason}`),
  ].join("\n") || "Nothing to sync: set notes.folders or mail.accounts in the config."

interface SyncOptions {
  notes?: boolean
  mail?: boolean
  folder?: string[]
  ignore?: string[]
  account?: string[]
  sinceTime?: string
  limit?: number
  retryAttachments?: boolean
  rescan?: boolean
  embed: boolean
  json?: boolean
}

const failedReason = ([first, ...rest]: ImportRun["failed"]): string | undefined =>
  first === undefined ? undefined : `${first.source}: ${first.reason}${rest.length ? ` (and ${rest.length} more)` : ""}`

export const syncCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  program
    .command("sync")
    .summary("bring notes and mail up to date in the store, only what changed")
    .description(
      "bring notes and mail up to date in the store, only what changed. Every configured folder and mail account " +
        "unless narrowed; a notes option syncs notes only, a mail option mail only, unless both are given",
    )
    .option("--notes", "notes only")
    .option("--mail", "mail only")
    .addOption(
      new Option("--folder <folder>", "notes: only this configured folder, by its id or path; repeat for more")
        .argParser(collect)
        .implies({ notes: true }),
    )
    .addOption(
      new Option("--ignore <path>", "notes: also skip this file or folder, a path or a glob; repeat for more")
        .argParser(collect)
        .implies({ notes: true }),
    )
    .addOption(
      new Option(
        "--account <account>",
        "mail: only this account, by its name in mail.accounts or its address; repeat for more",
      )
        .argParser(collect)
        .implies({ mail: true }),
    )
    .addOption(
      new Option(
        "--since-time <time>",
        `mail: read from this time, ISO 8601 or 30d ago (default: ${MAIL_WINDOW_DAYS}d)`,
      ).implies({ mail: true }),
    )
    .addOption(
      new Option("--limit <n>", "mail: most new emails to read per account this run (default: 200)")
        .argParser(positive)
        .implies({ mail: true }),
    )
    .addOption(
      new Option(
        "--retry-attachments",
        "mail: reread stored emails' attachments after installing an extraction engine",
      ).implies({ mail: true }),
    )
    .addOption(
      new Option(
        "--rescan",
        "mail: list every message again, not only mail an earlier run left; also checks deletions",
      ).implies({ mail: true }),
    )
    .option("--no-embed", "skip embedding notes and mail for search by meaning this run")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .addHelpText("after", `\n${LARGE_IMPORT_HELP}`)
    .action(async (options: SyncOptions, command: Command) => {
      const debug = command.optsWithGlobals().debug === true
      const both = !options.notes && !options.mail
      const config = loadConfig(env)
      if (env.MEMO_AUTO === "1") {
        await applyAuto(env, autoState(config))
        if (!autoState(config).enabled) return
      }
      const since = new Date(
        options.sinceTime === undefined
          ? Date.now() - MAIL_WINDOW_DAYS * DAY
          : momentOf(options.sinceTime, "--since-time"),
      )
      // An archive file is read whole each run, so only a sync that names it reads it.
      const accounts =
        both || options.mail
          ? mailAccounts(config.mail?.accounts ?? [], options.account).filter(
              (account) => account.mode !== "mbox" || options.account !== undefined,
            )
          : []
      const run: ImportRun = { notes: [], mail: [], failed: [] }
      const startedAt = Date.now()
      const answer = () =>
        itemAnswer(run, {
          meta: {
            ...(accounts.length ? { accounts: accounts.map(({ name }) => name) } : {}),
            complete: run.failed.length === 0,
            ...(run.failed.length ? { issues: issuesOf(run.failed) } : {}),
          },
        })
      const work = withImportLock(env, async () => {
        const store = await openStore({ env })
        const attempt = async (source: string, work: () => Promise<void>) => {
          try {
            await work()
          } catch (error) {
            const { error: failure } = await errorObject(error)
            const reason = debug ? String(error instanceof Error ? error.message : error) : failure.message
            run.failed.push({ source, code: failure.code, reason })
          }
        }
        try {
          if (both || options.notes) {
            const folders =
              options.folder === undefined
                ? await boundFolders(store, env, { strict: false })
                : await boundFolders(store, env, { only: options.folder })
            if (options.folder === undefined)
              for (const folder of noteFolders(config.notes))
                if (!folders.some(({ path }) => path === folder.path))
                  run.failed.push({
                    source: `notes ${folder.path}`,
                    code: "configuration_error",
                    reason: unboundReason(folder.path),
                  })
            const ignore = [...(config.notes?.ignore ?? []), ...(options.ignore ?? [])]
            for (const folder of folders)
              await attempt(`notes ${folder.path}`, async () => {
                run.notes.push(await importNotes(store, folder, { ignore, env }))
              })
            if (folders.length > 0)
              await attempt("notes by meaning", async () => {
                run.notesEmbedded = await embedNoteChunks(store, {
                  embed: options.embed && config.notes?.embed !== false,
                  env,
                })
              })
            await attempt("people-notes.json", async () => {
              await importNotesMap(store, env, folders)
            })
          }
          for (const account of accounts)
            await attempt(`mail ${account.name}`, async () => {
              run.mail.push(
                await importMail({
                  store,
                  source: mailSource(account, env),
                  account: { ...account, rules: await rulesOf(store, account, env, streams.diagnostic) },
                  since,
                  env,
                  embed: options.embed,
                  ...(options.limit === undefined ? {} : { max: options.limit }),
                  ...(config.mail?.max_body_chars === undefined ? {} : { maxBodyChars: config.mail.max_body_chars }),
                  ...(config.mail?.max_attachment_chars === undefined
                    ? {}
                    : { maxAttachmentChars: config.mail.max_attachment_chars }),
                  retryAttachments: options.retryAttachments ?? false,
                  rescan: options.rescan ?? false,
                }),
              )
            })
        } finally {
          await store.close()
        }
      })
      // The timer fires on schedule whatever the last run is doing; an overlap is not a failure of the unit.
      const skipped = await work.then(
        () => undefined,
        (error: unknown) => {
          if (env.MEMO_AUTO === "1" && isCliError(error) && error.details.reason === "sync.running")
            return `another memo sync is running (process ${String(error.details.pid)})`
          recordAutoRun(env, startedAt, error instanceof Error ? error.message : String(error))
          throw error
        },
      )
      if (skipped !== undefined) {
        run.skipped = skipped
        streams.diagnostic(`memo sync skipped: ${skipped}`)
        if (options.json) print(true, answer())
        return
      }
      recordAutoRun(env, startedAt, failedReason(run.failed))
      print(options.json, answer(), text(run))
      if (run.failed.length > 0) process.exitCode = 1
    })
}
