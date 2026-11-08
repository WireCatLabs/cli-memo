import { createDeadline, type ErrorCode, errorCodes, isCliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { FETCH, parseDuration } from "@wirecat/cli-core/cli"
import { markStoreDamaged, openStore, storePath } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError, Option } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP, STORE_CLIENT } from "../app.js"
import { decisionPolicy, loadConfig } from "../config.js"
import { errorObject } from "../failure.js"
import { boundFolders, UNBOUND, unboundReason } from "../notes/bound.js"
import { embedMailChunks, embedNoteChunks, type NoteChunksEmbedded } from "../notes/embed.js"
import { noteFolders } from "../notes/folders.js"
import { importNotes, type NotesImport } from "../notes/import.js"
import { collect } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { progressLine } from "../progress.js"
import { applyAuto, autoState, recordAutoRun } from "./auto.js"
import { withImportLock } from "./lock.js"

// An unexpected crash has no standard code to name it by; it still leaves the answer incomplete.
const issuesOf = (failed: ImportRun["failed"]) =>
  failed.flatMap(({ code, source }) =>
    (errorCodes as readonly string[]).includes(code) ? [{ code: code as ErrorCode, source }] : [],
  )

export interface ImportRun {
  notes: NotesImport[]
  /** The notes' chunks embedded for search by meaning this run. */
  notesEmbedded?: NoteChunksEmbedded
  /** The chunks of mail already in the store, which the `mail` CLI syncs, embedded for search by meaning this run. */
  mailEmbedded?: NoteChunksEmbedded
  /** A source that failed; the others still ran. `reasonId` names the failure from a fixed list, `reason` says it. */
  failed: { source: string; code: ErrorCode | "internal_error"; reasonId: string; reason: string }[]
  /** Why a timer run did nothing: another sync held the lock. */
  skipped?: string
}

const text = (run: ImportRun): string =>
  [
    ...run.notes.flatMap((n) => [
      `notes ${n.folder}: ${n.notes} notes, ${n.changed} changed, ${n.renamed} moved, ${n.deleted} gone` +
        (n.notRead ? `, ${n.notRead.length} not read` : "") +
        (n.deletionsSkipped === undefined ? "" : ` — deletions skipped: ${n.deletionsSkipped}`),
      ...(n.notRead ?? [])
        .slice(0, NOT_READ_SHOWN)
        .map(({ path, status, engine }) => `  not read: ${path} — ${notReadReason(status, engine)}`),
      ...((n.notRead?.length ?? 0) > NOT_READ_SHOWN
        ? [`  and ${(n.notRead?.length ?? 0) - NOT_READ_SHOWN} more not read — --json lists them all`]
        : []),
    ]),
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
    ...(run.mailEmbedded === undefined
      ? []
      : [
          `mail by meaning: ${run.mailEmbedded.chunks} chunks embedded` +
            (run.mailEmbedded.notEmbedded !== undefined
              ? ` — ${run.mailEmbedded.notEmbedded}`
              : run.mailEmbedded.left
                ? " — more next run"
                : ""),
        ]),
    ...run.failed.map(({ source, reason }) => `failed ${source}: ${reason}`),
  ].join("\n") || "Nothing to sync: add a notes folder with memo folders add."

const NOT_READ_SHOWN = 10

const NOT_READ: Record<string, string> = {
  "too-large": "larger than 50 MiB",
  unsupported: "this file type cannot be read",
  "needs-agent": "no text in it, such as a scanned PDF",
  unreadable: "the file is damaged or locked",
}

const notReadReason = (status: string, engine?: string): string =>
  status === "engine-missing" ? `needs the ${engine ?? "missing"} reader` : (NOT_READ[status] ?? status)

type Synced = "notes" | "mail"

interface SyncOptions {
  only?: Synced[]
  folder?: string[]
  ignore?: string[]
  embed: boolean
  json?: boolean
  timeout?: number
}

const onlyOf = (value: string): Synced[] => {
  const selected = value.split(",").map((part) => part.trim())
  if (!selected.length || selected.some((part) => part !== "notes" && part !== "mail"))
    throw new InvalidArgumentError("choose notes,mail, separated by commas")
  return [...new Set(selected)] as Synced[]
}

/** What a run syncs: --only, plus the side each narrowing option belongs to; both when nothing names a side. */
const syncedOf = (options: SyncOptions): Set<Synced> => {
  const synced = new Set(options.only)
  if (options.folder || options.ignore) synced.add("notes")
  return synced.size ? synced : new Set(["notes", "mail"])
}

/**
 * What the timer's `last.json` keeps of a failed run. A failure's message can name a folder, a sender or a subject,
 * and that file outlives the run, so it keeps the code and the kind of source; the message stays in the journal.
 */
const failedReason = ([first, ...rest]: ImportRun["failed"]): string | undefined =>
  first === undefined
    ? undefined
    : `${first.source.split(" ")[0]}: ${first.code} (${first.reasonId})${rest.length ? ` (and ${rest.length} more)` : ""}`

const crashReason = (error: unknown): string => {
  const { error: failure } = errorObject(error)
  return `${failure.code} (${failure.reason})`
}

/**
 * What a failed part of a sync reports. An unexpected error says only "this is a bug", so its first line is kept too:
 * the timer's log has to tell a dropped network from a real fault.
 */
export const failureReason = (error: unknown, failure: { reason: string; message: string }, debug: boolean): string => {
  if (debug) return String(error instanceof Error ? error.message : error)
  if (failure.reason !== "command.crashed" || !(error instanceof Error)) return failure.message
  return `${failure.message} (${error.name}: ${error.message.split("\n")[0]?.slice(0, 160)})`
}

export const syncCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv, signal?: AbortSignal): void => {
  const { print } = answers(program, streams, env)
  annotate(program.command("sync"), { effects: FETCH })
    .summary("bring notes up to date in the store, and make stored mail searchable by meaning")
    .description(
      "bring notes up to date in the store, only what changed, and embed the mail already stored for search by " +
        "meaning; the mail CLI syncs the mail itself (mail <profile> sync). Every configured folder unless narrowed",
    )
    .option("--only <resources>", "notes,mail, separated by commas; mail embeds stored mail only", onlyOf)
    .addOption(
      new Option(
        "--folder <folder>",
        "notes: only this configured folder, by its id or path; repeat for more",
      ).argParser(collect),
    )
    .addOption(
      new Option(
        "--ignore <path>",
        "notes: leave this file or folder alone this run, a path or a glob; repeat for more",
      ).argParser(collect),
    )
    .option("--no-embed", "skip embedding notes and mail for search by meaning this run")
    .option(
      "--timeout <duration>",
      "stop after this long, e.g. 10m; progress so far is kept (default: no limit)",
      (raw) => parseDuration(raw, "--timeout"),
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: SyncOptions, command: Command) => {
      const deadline = createDeadline({
        ...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
        ...(signal ? { signal } : {}),
      })
      try {
        await sync(options, command, deadline.signal)
      } finally {
        deadline.dispose()
      }
    })
  const sync = async (options: SyncOptions, command: Command, stop: AbortSignal) => {
    const halt = () => {
      if (stop.aborted) throw stop.reason
    }
    const debug = command.optsWithGlobals().debug === true
    const synced = syncedOf(options)
    const config = loadConfig(env)
    if (config.mail !== undefined)
      streams.diagnostic(
        "memo sync no longer imports mail: the mail CLI does (mail <profile> sync); memo config unset mail removes " +
          "the old settings, and memo doctor names the mailboxes\n",
      )
    if (env.MEMO_AUTO === "1") {
      await applyAuto(env, autoState(config))
      if (!autoState(config).enabled) return
    }
    const run: ImportRun = { notes: [], failed: [] }
    const startedAt = Date.now()
    const answer = () =>
      itemAnswer(run, {
        meta: {
          complete: run.failed.length === 0,
          ...(run.failed.length ? { issues: issuesOf(run.failed) } : {}),
        },
      })
    const work = withImportLock(env, async () => {
      const store = await openStore({ env, ...STORE_CLIENT, decisions: decisionPolicy(env) })
      const attempt = async (source: string, work: () => Promise<void>) => {
        halt()
        try {
          await work()
        } catch (error) {
          halt()
          markStoreDamaged(error, { store: storePath(env), command: "memo sync", version: APP.version })
          const { error: failure } = await errorObject(error)
          const reason = failureReason(error, failure, debug)
          run.failed.push({ source, code: failure.code, reasonId: failure.reason, reason })
        }
      }
      try {
        if (synced.has("notes")) {
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
                  reasonId: UNBOUND,
                  reason: unboundReason(folder.path),
                })
          const ignore = config.notes?.ignore ?? []
          const skip = options.ignore ?? []
          for (const folder of folders)
            await attempt(`notes ${folder.path}`, async () => {
              const onFile = progressLine(streams.diagnostic, Boolean(options.json), {
                step: "notes",
                unit: "files",
                label: folder.id,
              })
              run.notes.push(await importNotes(store, folder, { ignore, skip, env, onFile }))
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
        if (synced.has("mail"))
          await attempt("mail by meaning", async () => {
            run.mailEmbedded = await embedMailChunks(store, { embed: options.embed, env })
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
        recordAutoRun(env, startedAt, crashReason(error))
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
  }
}
