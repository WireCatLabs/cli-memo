import {
  createDeadline,
  type ErrorCode,
  errorCodes,
  isCliError,
  type KeyringStore,
  type Streams,
} from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { FETCH, parseDuration, setExitCode } from "@wirecat/cli-core/cli"
import { attachmentMaxBytes, sizeText } from "@wirecat/cli-core/documents"
import { markStoreDamaged, openStore, type SourceCheck, storePath } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP, STORE_CLIENT } from "../app.js"
import { decisionPolicy, loadConfig } from "../config.js"
import { errorObject } from "../failure.js"
import { combinedEnrichment, type EnrichmentReport, embedMailChunks, type NoteChunksEmbedded } from "../search/embed.js"
import { applyAuto, autoState, recordAutoRun } from "./auto.js"
import { type FilesSync, filesSync, type NotesImport } from "./files.js"
import { withImportLock } from "./lock.js"

// An unexpected crash has no standard code to name it by; it still leaves the answer incomplete.
const issuesOf = (failed: ImportRun["failed"]) =>
  failed.flatMap(({ code, source }) =>
    (errorCodes as readonly string[]).includes(code) ? [{ code: code as ErrorCode, source }] : [],
  )

export interface ImportRun {
  /** What `wcat-files sync` brought in from the notes folders; empty when files is not installed. */
  notes: NotesImport[]
  /** The notes' chunks embedded for search by meaning this run, as `wcat-files sync` reported them. */
  notesEmbedded?: Omit<NoteChunksEmbedded, "enrichment">
  /** The chunks of mail already in the store, which the `mail` CLI syncs, embedded for search by meaning this run. */
  mailEmbedded?: Omit<NoteChunksEmbedded, "enrichment">
  /** What enrichment sent to the owner's chosen provider this run, notes and mail together; absent when it is off. */
  enrichment?: EnrichmentReport
  /** A source that failed; the others still ran. `reasonId` names the failure from a fixed list, `reason` says it. */
  failed: { source: string; code: ErrorCode | "internal_error"; reasonId: string; reason: string }[]
  /** Why a timer run did nothing: another sync held the lock. */
  skipped?: string
  /** The last step, "memories follow sources": what `memories check` answers. */
  sourceCheck?: SourceCheck
  /** Why that step failed; it is reported here and never fails the sync. */
  sourceCheckFailed?: { code: ErrorCode | "internal_error"; reasonId: string; reason: string }
  /** The people matcher's pass: people joined, matches opened for the owner, pairs left apart. */
  people?: { merged: number; proposed: number; skipped: number }
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
    ...(run.enrichment === undefined ? [] : [enrichmentLine(run.enrichment)]),
    ...(run.people === undefined || run.people.merged + run.people.proposed === 0
      ? []
      : [`people: ${run.people.merged} joined, ${run.people.proposed} new matches — wcat people review`]),
    ...run.failed.map(({ source, reason }) => `failed ${source}: ${reason}`),
    ...(run.sourceCheck?.raised
      ? [
          `memories follow sources: ${run.sourceCheck.raised} raised for review — wcat review list kind:memory_source_review`,
        ]
      : []),
    ...(run.sourceCheckFailed ? [`memories follow sources not checked: ${run.sourceCheckFailed.reason}`] : []),
  ].join("\n") || "Nothing to sync: the mail CLI brings mail in, and files folders add brings in notes."

const enrichmentLine = (run: EnrichmentReport): string =>
  `enrichment: ${run.enriched} of ${run.sent} records sent${run.provider ? ` to ${run.provider} ${run.model}` : ""}` +
  (run.costUsd === null ? "" : `, $${run.costUsd}`) +
  (run.left > 0 ? `, ${run.left} left` : "") +
  (run.status === "done" ? "" : ` — ${run.status}: ${run.reason ?? "no reason given"}`)

const NOT_READ_SHOWN = 10

const NOT_READ: Record<string, string> = {
  unsupported: "this file type cannot be read",
  "needs-agent": "no text in it, such as a scanned PDF",
  unreadable: "the file is damaged or locked",
}

const notReadReason = (status: string, engine?: string): string =>
  status === "engine-missing"
    ? `needs the ${engine ?? "missing"} reader`
    : status === "too-large"
      ? `larger than ${sizeText(attachmentMaxBytes())}; configure MESSAGING_ATTACHMENT_MAX_MIB`
      : (NOT_READ[status] ?? status)

type Synced = "notes" | "mail" | "people"

interface SyncOptions {
  only?: Synced[]
  embed: boolean
  json?: boolean
  timeout?: number
}

const SYNCED: readonly Synced[] = ["notes", "mail", "people"]

const onlyOf = (value: string): Synced[] => {
  const selected = value.split(",").map((part) => part.trim())
  if (!selected.length || selected.some((part) => !SYNCED.includes(part as Synced)))
    throw new InvalidArgumentError("choose notes,mail,people, separated by commas")
  return [...new Set(selected)] as Synced[]
}

/** What a run syncs: --only, or all. */
const syncedOf = (options: SyncOptions): Set<Synced> => (options.only ? new Set(options.only) : new Set(SYNCED))

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

export const syncCommand = (
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
  keyring?: KeyringStore,
): void => {
  const { print } = answers(program, streams, env)
  annotate(program.command("sync"), { effects: FETCH })
    .summary("embed stored mail for search by meaning, match people, and sync notes through files")
    .description(
      "embed the mail already stored for search by meaning, match people across sources (wcat people scan), and " +
        "run files sync when the files CLI is installed, which brings notes folders up to date; the mail CLI syncs " +
        "the mail itself (mail <profile> sync)",
    )
    .option(
      "--only <resources>",
      "notes,mail,people, separated by commas; notes runs files sync, mail embeds stored mail only, people links who is who",
      onlyOf,
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
        "wcat sync does not import mail: the mail CLI does (mail <profile> sync); wcat config unset mail removes " +
          "the old settings, and wcat doctor names the mailboxes\n",
      )
    if (env.WCAT_AUTO === "1") {
      await applyAuto(env, autoState(config))
      if (!autoState(config).enabled) return
    }
    const run: ImportRun = { notes: [], failed: [] }
    let filesEnrichment: EnrichmentReport | undefined
    const startedAt = Date.now()
    const answer = () =>
      itemAnswer(run, {
        meta: {
          complete: run.failed.length === 0,
          ...(run.failed.length ? { issues: issuesOf(run.failed) } : {}),
        },
      })
    if (synced.has("notes")) {
      halt()
      const files: FilesSync = await filesSync(env, { embed: options.embed, signal: stop })
      if (files.ran) {
        run.notes = files.notes
        if (files.notesEmbedded) run.notesEmbedded = files.notesEmbedded
        if (files.enrichment) filesEnrichment = files.enrichment
        for (const one of files.failed) run.failed.push(one)
      } else if (options.only?.includes("notes"))
        run.failed.push({
          source: "notes",
          code: "not_found",
          reasonId: "files.not-installed",
          reason: "notes are synced by the files CLI, which is not installed: npm install -g @wirecat/files-cli",
        })
    }
    const work = withImportLock(env, async () => {
      const store = await openStore({ env, ...STORE_CLIENT, decisions: decisionPolicy(env) })
      const enriched: (EnrichmentReport | undefined)[] = [filesEnrichment]
      const attempt = async (source: string, work: () => Promise<void>) => {
        halt()
        try {
          await work()
        } catch (error) {
          halt()
          markStoreDamaged(error, { store: storePath(env), command: "wcat sync", version: APP.version })
          const { error: failure } = await errorObject(error)
          const reason = failureReason(error, failure, debug)
          run.failed.push({ source, code: failure.code, reasonId: failure.reason, reason })
        }
      }
      try {
        if (synced.has("mail"))
          await attempt("mail by meaning", async () => {
            const { enrichment, ...embedded } = await embedMailChunks(store, {
              embed: options.embed,
              env,
              ...(keyring ? { keyring } : {}),
            })
            run.mailEmbedded = embedded
            enriched.push(enrichment)
          })
        if (synced.has("people"))
          await attempt("people", async () => {
            const scan = await store.people.scanMatches()
            run.people = {
              merged: scan.merged.length,
              proposed: scan.proposed.filter(({ opened }) => opened).length,
              skipped: scan.skipped.length,
            }
          })
        // Reported once, as item.enrichment, notes and mail together.
        const enrichment = combinedEnrichment(...enriched)
        if (enrichment) run.enrichment = enrichment
        halt()
        try {
          run.sourceCheck = await store.knowledge.checkSources()
        } catch (error) {
          halt()
          markStoreDamaged(error, { store: storePath(env), command: "wcat sync", version: APP.version })
          const { error: failure } = await errorObject(error)
          run.sourceCheckFailed = {
            code: failure.code,
            reasonId: failure.reason,
            reason: failureReason(error, failure, debug),
          }
        }
      } finally {
        await store.close()
      }
    })
    // The timer fires on schedule whatever the last run is doing; an overlap is not a failure of the unit.
    const skipped = await work.then(
      () => undefined,
      (error: unknown) => {
        if (env.WCAT_AUTO === "1" && isCliError(error) && error.details.reason === "sync.running")
          return `another wcat sync is running (process ${String(error.details.pid)})`
        recordAutoRun(env, startedAt, crashReason(error))
        throw error
      },
    )
    if (skipped !== undefined) {
      run.skipped = skipped
      streams.diagnostic(`wcat sync skipped: ${skipped}`)
      if (options.json) print(true, answer())
      return
    }
    recordAutoRun(env, startedAt, failedReason(run.failed))
    print(options.json, answer(), text(run))
    if (run.failed.length > 0) setExitCode(program, 1)
  }
}
