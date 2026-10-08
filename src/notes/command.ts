import { readFileSync } from "node:fs"
import { CliError, createRenderer, type Streams } from "@leemour/cli-core"
import { normalizeTag } from "@leemour/cli-messaging"
import { type MessageStore, type Note, openStore } from "@leemour/cli-messaging/store"
import { type Command, InvalidArgumentError } from "commander"
import { loadConfig } from "../config.js"
import { positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { subjectOf } from "../people/subject.js"
import { ownerKey } from "../store/owner.js"
import { aboutText, notesAbout } from "./about.js"
import { boundFolders, folderOfFile } from "./bound.js"
import { DIALECTS, type DialectName } from "./dialects/index.js"
import { folderNotes, importNotes, type NotesImport } from "./import.js"
import { exportInternal, exportTarget, internalNotes } from "./internal.js"
import { type NotesSearch, searchNotes } from "./search.js"
import { loadFolderState } from "./state.js"

const formatOf = (value: string): DialectName => {
  if (!(DIALECTS as readonly string[]).includes(value)) throw new InvalidArgumentError(`choose ${DIALECTS.join(", ")}`)
  return value as DialectName
}

const sourceOf = (value: string): Note["source"] => {
  if (value !== "file" && value !== "internal") throw new InvalidArgumentError("choose file or internal")
  return value
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
    ...result.hits.map((hit) => `${hit.path ?? hit.ref}\n  ${hit.line}`),
    ...(result.hasMore ? ["More notes match; raise --limit or follow nextOffset."] : []),
    ...(result.linked.length === 0
      ? []
      : [
          "",
          "Linked from these notes",
          ...result.linked.map(
            ({ ref, name, notes }) => `  ${name ?? ref}  ${ref ?? "(nobody by that name yet)"}  (${notes})`,
          ),
        ]),
  ].join("\n")

const importText = (results: NotesImport[]): string =>
  results
    .map(
      (result) =>
        `${result.folder}: ${result.notes} notes, ${result.changed} changed, ${result.renamed} moved, ${result.deleted} gone` +
        (result.deletionsSkipped === undefined ? "" : `\nDeletions skipped: ${result.deletionsSkipped}`) +
        (result.tagsSkipped === undefined ? "" : `\nTags not stored: ${result.tagsSkipped}`),
    )
    .join("\n")

const textOf = (options: { text?: string; file?: string }, given?: string): string => {
  const sources = [given, options.text, options.file].filter((value) => value !== undefined)
  if (sources.length !== 1)
    throw new CliError("validation_error", "give the text once: as an argument, --text or --file")
  if (options.file !== undefined) return readFileSync(options.file === "-" ? 0 : options.file, "utf8")
  return sources[0] as string
}

/** `note:<id>`, or a file inside a configured folder. */
const noteOf = async (store: MessageStore, env: NodeJS.ProcessEnv, reference: string): Promise<Note> => {
  if (reference.startsWith("note:")) return store.notes.note(reference.slice("note:".length))
  const { folder, path } = folderOfFile(await boundFolders(store, env, { strict: false }), reference)
  const found = (await folderNotes(store, folder.id)).find((note) => note.path === path)
  if (!found) throw new CliError("not_found", `${reference} is not imported — memo notes import`)
  return found
}

export const notesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const print = (json: boolean | undefined, value: unknown, text: string) => {
    if (json) createRenderer({ format: "json", color: false, streams }).result(value)
    else streams.data(`${text}\n`)
  }
  const withStore = async <T>(work: (store: MessageStore) => Promise<T>): Promise<T> => {
    const store = await openStore({ env })
    try {
      await importNotesMap(store, env, await boundFolders(store, env, { strict: false }))
      return await work(store)
    } finally {
      await store.close()
    }
  }
  const notes = program
    .command("notes")
    .description("Notes: files from your folders, and notes you write here about messages, people and projects")

  notes
    .command("import")
    .description("Bring the folders' notes, their links and tags into the shared store — only what changed")
    .option("--folder <path-or-id...>", "only these configured folders")
    .option("--ignore <path...>", "files or folders inside them to skip, added to notes.ignore — a path or a glob")
    .option("--json", "print JSON")
    .action(async (options: { folder?: string[]; ignore?: string[]; json?: boolean }) => {
      const results = await withStore(async (store) => {
        const config = loadConfig(env).notes
        const folders = await boundFolders(store, env, options.folder === undefined ? {} : { only: options.folder })
        if (folders.length === 0)
          throw new CliError("configuration_error", "no folders of notes — memo folders add <path>")
        const ignore = [...(config?.ignore ?? []), ...(options.ignore ?? [])]
        const imported: NotesImport[] = []
        for (const folder of folders) imported.push(await importNotes(store, folder, { ignore, env }))
        await importNotesMap(store, env, folders)
        return imported
      })
      print(options.json, results, importText(results))
    })

  notes
    .command("search")
    .description("Find notes by their words and word stems, in the query language messages use")
    .argument("<text>", "words, phrases, AND/OR/NOT, tag:, date:")
    .option("--tag <tag>", "only notes with this tag", normalizeTag)
    .option("--filter <query>", "another query every note found must also match")
    .option("--exact", "every word as written: no stems")
    .option("--folder <path-or-id...>", "only these folders")
    .option("--source <source>", "file or internal", sourceOf)
    .option("--offset <n>", "continue from nextOffset", Number, 0)
    .option("--limit <n>", "most notes to show", positive, 20)
    .option("--json", "print JSON")
    .action(
      async (
        text: string,
        options: {
          limit: number
          offset: number
          tag?: string
          filter?: string
          exact?: boolean
          folder?: string[]
          source?: Note["source"]
          json?: boolean
        },
      ) => {
        const result = await withStore(async (store) =>
          searchNotes(store, text, {
            limit: options.limit,
            offset: options.offset,
            ...(options.exact ? { exact: true } : {}),
            ...(options.tag === undefined ? {} : { tag: options.tag }),
            ...(options.filter === undefined ? {} : { filter: options.filter }),
            ...(options.source === undefined ? {} : { source: options.source }),
            ...(options.folder === undefined
              ? {}
              : { folderIds: (await boundFolders(store, env, { only: options.folder })).map(({ id }) => id) }),
          }),
        )
        print(options.json, result, searchText(result))
      },
    )

  notes
    .command("about")
    .description(
      "Notes about a person, project or note, and the notes that link them — through links, never a name in plain text",
    )
    .argument("<subject>", "<messenger>:<name or id>, person:<uid>, entity:<id> or note:<id>")
    .option("--limit <n>", "most notes of each kind", positive, 20)
    .option("--json", "print JSON")
    .action(async (subject: string, options: { limit: number; json?: boolean }) => {
      const answer = await withStore(async (store) => notesAbout(store, await subjectOf(store, subject), options.limit))
      print(options.json, answer, aboutText(answer))
    })

  notes
    .command("show")
    .description("One note: its text, tags, what it links and what links it")
    .argument("<note>", "note:<id>, or a file in a configured folder")
    .option("--json", "print JSON")
    .action(async (reference: string, options: { json?: boolean }) => {
      const answer = await withStore(async (store) => {
        const note = await noteOf(store, env, reference)
        const owner = await ownerKey(store)
        const ref = `note:${note.id}`
        return {
          ...note,
          ref,
          tags: owner ? await store.knowledge.tags(owner, { type: "note", id: note.id }) : [],
          links: await store.notes.links({ from: ref }),
          backlinks: await store.notes.links({ to: ref }),
          provenance:
            note.folderId === null
              ? null
              : (loadFolderState(env, note.folderId)?.documents[note.path as string] ?? null),
        }
      })
      print(options.json, answer, answer.text)
    })

  notes
    .command("list")
    .description("Notes, newest first")
    .option("--about <subject>", "only notes about this: <messenger>:<name or id> or a typed reference")
    .option("--source <source>", "file or internal", sourceOf)
    .option("--search <text>", "only notes holding this text, as written")
    .option("--offset <n>", "skip this many", Number, 0)
    .option("--limit <n>", "most notes, at most 500", positive, 20)
    .option("--json", "print JSON")
    .action(
      async (options: {
        about?: string
        source?: Note["source"]
        search?: string
        offset: number
        limit: number
        json?: boolean
      }) => {
        const page = await withStore(async (store) =>
          store.notes.notes({
            limit: options.limit,
            offset: options.offset,
            ...(options.about === undefined ? {} : { about: (await subjectOf(store, options.about)).ref }),
            ...(options.source === undefined ? {} : { source: options.source }),
            ...(options.search === undefined ? {} : { search: options.search }),
          }),
        )
        print(
          options.json,
          page,
          page.items
            .map((note) => `${note.id}  ${note.source}  ${note.path ?? note.title ?? note.text.split("\n")[0]}`)
            .join("\n") || "No notes.",
        )
      },
    )

  notes
    .command("add")
    .description("Write a note of your own about messages, people, projects or other notes")
    .argument("[text]", "the note; or --text, or --file")
    .option("--text <text>", "the note")
    .option("--file <path>", "read the note from a file; - reads stdin")
    .option("--title <title>", "a title")
    .option(
      "--about <subject...>",
      "what it is about: <messenger>:<name or id>, msg:, chat:, person:, entity:, task:, note:",
    )
    .option("--export [dir]", "also write it as a file — to this folder, or notes.export.dir")
    .option("--format <format>", `the file's format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON")
    .action(
      async (
        given: string | undefined,
        options: {
          text?: string
          file?: string
          title?: string
          about?: string[]
          export?: string | true
          format?: DialectName
          json?: boolean
        },
      ) => {
        const body = textOf(options, given)
        const answer = await withStore(async (store) => {
          const about = await Promise.all(
            (options.about ?? []).map(async (subject) => (await subjectOf(store, subject)).ref),
          )
          const note = await store.notes.addNote({
            text: body,
            about,
            ...(options.title === undefined ? {} : { title: options.title }),
          })
          if (options.export === undefined) return { note }
          const target = exportTarget(loadConfig(env), options.export, options.format)
          return { note, exported: await exportInternal(store, { ...target, notes: [note] }) }
        })
        print(options.json, answer, answer.note.id)
      },
    )

  notes
    .command("edit")
    .description("Change a note you wrote here; a file's note is edited in its file")
    .argument("<id>", "the note's id")
    .requiredOption("--revision <n>", "its current revision, so an edit made meanwhile is not lost", positive)
    .option("--text <text>", "the new text")
    .option("--file <path>", "read the new text from a file; - reads stdin")
    .option("--export [dir]", "also rewrite its file — in this folder, or notes.export.dir")
    .option("--format <format>", `the file's format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON")
    .action(
      async (
        id: string,
        options: {
          revision: number
          text?: string
          file?: string
          export?: string | true
          format?: DialectName
          json?: boolean
        },
      ) => {
        const body = textOf(options)
        const answer = await withStore(async (store) => {
          const note = await store.notes.editNote(id.replace(/^note:/, ""), body, options.revision)
          if (options.export === undefined) return { note }
          const target = exportTarget(loadConfig(env), options.export, options.format)
          return { note, exported: await exportInternal(store, { ...target, notes: [note] }) }
        })
        print(options.json, answer, `${answer.note.id} revision ${answer.note.revision}`)
      },
    )

  notes
    .command("remove")
    .description("Delete a note you wrote here; a file it was exported to stays")
    .argument("<id>", "the note's id")
    .option("--json", "print JSON")
    .action(async (id: string, options: { json?: boolean }) => {
      const answer = await withStore((store) => store.notes.removeNote(id.replace(/^note:/, "")))
      print(options.json, answer, `${answer.id} removed`)
    })

  notes
    .command("export")
    .description("Write the notes you wrote here as files, never overwriting one you edited")
    .option("--to <dir>", "the folder to write to (default: notes.export.dir)")
    .option("--format <format>", `the files' format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON")
    .action(async (options: { to?: string; format?: DialectName; json?: boolean }) => {
      const target = exportTarget(loadConfig(env), options.to, options.format)
      const result = await withStore(async (store) =>
        exportInternal(store, { ...target, notes: await internalNotes(store) }),
      )
      print(
        options.json,
        result,
        [
          `${result.dir}: ${result.written.length} written, ${result.unchanged.length} unchanged`,
          ...result.edited.map(({ path }) => `Edited since export, left as it is: ${path}`),
        ].join("\n"),
      )
    })
}
