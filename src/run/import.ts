import { join } from "node:path"
import { CliError, createRenderer, resolvePaths, type Streams } from "@leemour/cli-core"
import { releaseLock, takeLock } from "@leemour/cli-messaging/background"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { loadConfig } from "../config.js"
import { himalaya } from "../mail/himalaya.js"
import { type ImportResult, importMail } from "../mail/import.js"
import { embedChanged, type NotesEmbedded } from "../notes/embed.js"
import { folderPaths } from "../notes/folders.js"
import { importNotes, type NotesImport, notesKey } from "../notes/import.js"
import { applyAuto, autoState } from "./auto.js"

const DAY = 86_400_000
const MAIL_WINDOW_DAYS = 30

export interface ImportRun {
  notes: (NotesImport & { embedded?: NotesEmbedded })[]
  mail: ImportResult[]
  /** A source that failed; the others still ran. */
  failed: { source: string; reason: string }[]
}

const text = (run: ImportRun): string =>
  [
    ...run.notes.map(
      (n) =>
        `notes ${n.folder}: ${n.notes} notes, ${n.changed} changed, ${n.deleted} gone` +
        (n.embedded === undefined
          ? ""
          : n.embedded.notEmbedded !== undefined
            ? ` — not embedded: ${n.embedded.notEmbedded}`
            : `, ${n.embedded.chunks} chunks embedded${n.embedded.left ? ", more next run" : ""}`) +
        (n.deletionsSkipped === undefined ? "" : ` — deletions skipped: ${n.deletionsSkipped}`),
    ),
    ...run.mail.map(
      (m) =>
        `mail ${m.account}: ${m.listed} listed, ${m.saved} new, ${m.deleted} gone` +
        (m.complete ? "" : " — more to read next run") +
        (m.deletionsSkipped === undefined ? "" : ` — deletions skipped: ${m.deletionsSkipped}`),
    ),
    ...run.failed.map(({ source, reason }) => `failed ${source}: ${reason}`),
  ].join("\n") || "Nothing to import: set notes.folders or mail.accounts in the config."

export const importCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("import")
    .description("Bring notes and mail up to date in the shared store — only what changed; the timer runs this")
    .option("--notes", "notes only")
    .option("--mail", "mail only")
    .option("--no-embed", "build notes for search but skip embedding them for meaning this run")
    .option("--json", "print JSON")
    .action(async (options: { notes?: boolean; mail?: boolean; embed: boolean; json?: boolean }) => {
      const both = !options.notes && !options.mail
      const config = loadConfig(env)
      if (env.MEMO_AUTO === "1") {
        await applyAuto(env, autoState(config))
        if (!autoState(config).enabled) return
      }
      const lock = join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).state, "import.lock")
      const holder = takeLock(lock, { pid: process.pid, startedAt: new Date().toISOString() })
      if (holder !== undefined)
        throw new CliError(
          "rate_limited",
          `an import is already running (process ${holder.pid}); try again when it ends`,
        )
      const store = await openStore({ env })
      const run: ImportRun = { notes: [], mail: [], failed: [] }
      const attempt = async (source: string, work: () => Promise<void>) => {
        try {
          await work()
        } catch (error) {
          run.failed.push({ source, reason: error instanceof Error ? error.message : String(error) })
        }
      }
      try {
        if (both || options.notes) {
          for (const folder of folderPaths(config.notes))
            await attempt(`notes ${folder}`, async () => {
              const imported = await importNotes(store, folder, { ignore: config.notes?.ignore ?? [] })
              const embedded = await embedChanged(store, notesKey(folder), imported.chats, {
                embed: options.embed && config.notes?.embed !== false,
                env,
              })
              run.notes.push({ ...imported, embedded })
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
        releaseLock(lock, process.pid)
      }
      if (options.json) createRenderer({ format: "json", color: false, streams }).result(run)
      else streams.data(`${text(run)}\n`)
      if (run.failed.length > 0) process.exitCode = 1
    })
}
