import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { normalizeTag } from "@leemour/cli-messaging"
import { openStore } from "@leemour/cli-messaging/store"
import type { Command } from "commander"
import { loadConfig } from "../config.js"
import { positive } from "../options.js"
import { loadNotesMap } from "../people/notes-map.js"
import { embedChanged } from "./embed.js"
import { importNotes, type NotesImport, notesKey } from "./import.js"
import { findNotes } from "./read.js"
import { type NotesSearch, searchNotes } from "./search.js"
import { notesText } from "./text.js"

const NO_FOLDERS = "no folders: pass --folder or set notes.folders in the config"

interface Scope {
  folder?: string[]
  ignore?: string[]
}

const searchText = (result: NotesSearch): string =>
  [
    ...(result.hits.length === 0
      ? [
          result.tag === undefined
            ? `No note holds "${result.query}". Run memo notes import if notes changed.`
            : `No note tagged ${result.tag} matches "${result.query}".`,
        ]
      : []),
    ...result.hits.map((hit) => `${hit.path}\n  ${hit.line}`),
    ...(result.hasMore ? ["More notes match; raise --limit to see them."] : []),
    ...(result.linked.length === 0
      ? []
      : ["", "Linked from these notes", ...result.linked.map(({ name, notes }) => `  ${name}  (${notes})`)]),
    ...(result.mentioned.length === 0
      ? []
      : [
          "",
          "Named in these notes (by name only — may be someone else)",
          ...result.mentioned.map(({ provider, id, name, notes }) => `  ${name}  ${provider}:${id}  (${notes})`),
        ]),
  ].join("\n")

const importText = (results: NotesImport[]): string =>
  results
    .map(
      (result) =>
        `${result.folder}: ${result.notes} notes stored, ${result.deleted} gone from the folder` +
        (result.deletionsSkipped === undefined ? "" : `\nDeletions skipped: ${result.deletionsSkipped}`),
    )
    .join("\n")

export const notesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const scope = (options: Scope) => {
    const notes = loadConfig(env).notes
    return {
      folders: options.folder ?? notes?.folders ?? [],
      ignore: [...(notes?.ignore ?? []), ...(options.ignore ?? [])],
    }
  }
  const print = (json: boolean | undefined, value: unknown, text: string) => {
    if (json) createRenderer({ format: "json", color: false, streams }).result(value)
    else streams.data(`${text}\n`)
  }
  const notes = program.command("notes").description("Markdown notes: who they are about, and searching them")
  const scoped = (command: Command) =>
    command
      .option("--folder <path...>", "folders of notes (default: notes.folders in the config)")
      .option("--ignore <path...>", "files or folders inside them to skip, added to notes.ignore — a path or a glob")

  scoped(
    notes
      .command("about")
      .description("Notes about a person, notes that link them, and weak plain-name mentions; reads the folders")
      .argument("<name>", "the person's name, as in the note's file name or its aliases"),
  )
    .option("--limit <n>", "most links and mentions to show of each kind", positive, 20)
    .option("--json", "print JSON")
    .action((name: string, options: Scope & { limit: number; json?: boolean }) => {
      const { folders, ignore } = scope(options)
      const answer =
        folders.length === 0
          ? { ...findNotes([], name), complete: false, notRead: [{ folder: "", reason: NO_FOLDERS }] }
          : findNotes(folders, name, options.limit, ignore)
      print(options.json, answer, notesText(answer))
    })

  scoped(notes.command("import").description("Load the notes into the shared store, so search finds them"))
    .option("--no-embed", "skip embedding them for search by meaning")
    .option("--json", "print JSON")
    .action(async (options: Scope & { embed: boolean; json?: boolean }) => {
      const { folders, ignore } = scope(options)
      if (folders.length === 0) throw new CliError("configuration_error", NO_FOLDERS)
      const store = await openStore({ env })
      try {
        const results: NotesImport[] = []
        for (const folder of folders) {
          const imported = await importNotes(store, folder, { ignore })
          await embedChanged(store, notesKey(folder), imported.chats, {
            embed: options.embed && loadConfig(env).notes?.embed !== false,
            env,
          })
          results.push(imported)
        }
        print(options.json, results, importText(results))
      } finally {
        await store.close()
      }
    })

  notes
    .command("search")
    .description("Find stored notes by their words, and who those notes link")
    .argument("<text>", "words to find, three letters or more")
    .option("--tag <tag>", "only notes with this tag, including tags on their folder", normalizeTag)
    .option("--limit <n>", "most notes to show", positive, 20)
    .option("--json", "print JSON")
    .action(async (text: string, options: { limit: number; json?: boolean; tag?: string }) => {
      const store = await openStore({ env })
      try {
        const result = await searchNotes(store, text, {
          limit: options.limit,
          notesMap: loadNotesMap(env),
          ...(options.tag === undefined ? {} : { tag: options.tag }),
        })
        print(options.json, result, searchText(result))
      } finally {
        await store.close()
      }
    })
}
