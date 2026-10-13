import { CliError, createRenderer, type Streams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-messaging/store"
import { type Command, Option } from "commander"
import { type Config, loadConfig } from "../config.js"
import { himalaya } from "../mail/himalaya.js"
import { type ImportResult, importMail } from "../mail/import.js"
import { boundFolders, unboundReason } from "../notes/bound.js"
import { embedNoteChunks, type NoteChunksEmbedded } from "../notes/embed.js"
import { noteFolders } from "../notes/folders.js"
import { importNotes, type NotesImport } from "../notes/import.js"
import { collect, positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { applyAuto, autoState } from "./auto.js"
import { withImportLock } from "./lock.js"

const DAY = 86_400_000
const MAIL_WINDOW_DAYS = 30

export interface ImportRun {
  notes: NotesImport[]
  /** The notes' chunks embedded for search by meaning this run. */
  notesEmbedded?: NoteChunksEmbedded
  mail: ImportResult[]
  /** A source that failed; the others still ran. */
  failed: { source: string; reason: string }[]
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
        `mail ${m.account}: ${m.listed} listed, ${m.saved} new, ${m.deleted} gone` +
        (m.complete ? "" : " — more to read next run") +
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
  embed: boolean
  json?: boolean
}

type MailAccount = NonNullable<Config["mail"]>["accounts"][number]

const mailAccounts = (accounts: MailAccount[], names: string[] | undefined): MailAccount[] => {
  if (names === undefined) return accounts
  return names.map((name) => {
    const found = accounts.find(
      (account) => account.name === name || account.address.toLowerCase() === name.toLowerCase(),
    )
    if (found) return found
    const choices = accounts.map((account) => account.name).join(", ") || "none"
    throw new CliError("not_found", `no mail account "${name}" in mail.accounts — it holds ${choices}`)
  })
}

export const syncCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
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
    .option("--no-embed", "skip embedding notes and mail for search by meaning this run")
    .option("--json", "print JSON")
    .action(async (options: SyncOptions) => {
      const both = !options.notes && !options.mail
      const config = loadConfig(env)
      if (env.MEMO_AUTO === "1") {
        await applyAuto(env, autoState(config))
        if (!autoState(config).enabled) return
      }
      // The messenger CLI module costs every memo command ~70 ms to load; only --since-time needs it.
      const since = new Date(
        options.sinceTime === undefined
          ? Date.now() - MAIL_WINDOW_DAYS * DAY
          : (await import("@wirecat/cli-messaging/cli")).momentOf(options.sinceTime, "--since-time"),
      )
      const accounts = both || options.mail ? mailAccounts(config.mail?.accounts ?? [], options.account) : []
      const run: ImportRun = { notes: [], mail: [], failed: [] }
      await withImportLock(env, async () => {
        const store = await openStore({ env })
        const attempt = async (source: string, work: () => Promise<void>) => {
          try {
            await work()
          } catch (error) {
            run.failed.push({ source, reason: error instanceof Error ? error.message : String(error) })
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
                  run.failed.push({ source: `notes ${folder.path}`, reason: unboundReason(folder.path) })
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
                  run: himalaya(env),
                  account,
                  since,
                  env,
                  embed: options.embed,
                  ...(options.limit === undefined ? {} : { max: options.limit }),
                  ...(config.mail?.maxBodyChars === undefined ? {} : { maxBodyChars: config.mail.maxBodyChars }),
                  ...(config.mail?.maxAttachmentChars === undefined
                    ? {}
                    : { maxAttachmentChars: config.mail.maxAttachmentChars }),
                  retryAttachments: options.retryAttachments ?? false,
                }),
              )
            })
        } finally {
          await store.close()
        }
      })
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(run)
      else streams.data(`${text(run)}\n`)
      if (run.failed.length > 0) process.exitCode = 1
    })
}
