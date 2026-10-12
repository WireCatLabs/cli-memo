import { createRenderer, type Streams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-messaging/store"
import type { Command } from "commander"
import { loadConfig } from "../config.js"
import { himalaya } from "../mail/himalaya.js"
import { type ImportResult, importMail } from "../mail/import.js"
import { boundFolders } from "../notes/bound.js"
import { embedNoteChunks, type NoteChunksEmbedded } from "../notes/embed.js"
import { noteFolders } from "../notes/folders.js"
import { importNotes, type NotesImport } from "../notes/import.js"
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
  ].join("\n") || "Nothing to import: set notes.folders or mail.accounts in the config."

export const syncCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  syncLeaf(program, "sync", streams, env)
  // The old name, kept for a few releases: installed timers and saved scripts still run `memo import` (NEED-985).
  syncLeaf(program, "import", streams, env, { hidden: true }).hook("preAction", () => {
    streams.diagnostic("memo import is now memo sync — `memo sync`; the old name will stop working\n")
  })
}

const syncLeaf = (
  program: Command,
  name: string,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  options: { hidden?: boolean } = {},
): Command =>
  program
    .command(name, options)
    .description("Bring notes and mail up to date in the shared store — only what changed; the timer runs this")
    .option("--notes", "notes only")
    .option("--mail", "mail only")
    .option("--no-embed", "skip embedding notes and mail for search by meaning this run")
    .option("--json", "print JSON")
    .action(async (options: { notes?: boolean; mail?: boolean; embed: boolean; json?: boolean }) => {
      const both = !options.notes && !options.mail
      const config = loadConfig(env)
      if (env.MEMO_AUTO === "1") {
        await applyAuto(env, autoState(config))
        if (!autoState(config).enabled) return
      }
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
            const folders = await boundFolders(store, env, { strict: false })
            for (const folder of noteFolders(config.notes))
              if (!folders.some(({ path }) => path === folder.path))
                run.failed.push({
                  source: `notes ${folder.path}`,
                  reason: `no folder id — memo folders add ${folder.path}`,
                })
            for (const folder of folders)
              await attempt(`notes ${folder.path}`, async () => {
                run.notes.push(await importNotes(store, folder, { ignore: config.notes?.ignore ?? [], env }))
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
          if (both || options.mail) {
            for (const account of config.mail?.accounts ?? [])
              await attempt(`mail ${account.name}`, async () => {
                run.mail.push(
                  await importMail({
                    store,
                    run: himalaya(env),
                    account,
                    since: new Date(Date.now() - MAIL_WINDOW_DAYS * DAY),
                    env,
                    embed: options.embed,
                  }),
                )
              })
          }
        } finally {
          await store.close()
        }
      })
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(run)
      else streams.data(`${text(run)}\n`)
      if (run.failed.length > 0) process.exitCode = 1
    })
