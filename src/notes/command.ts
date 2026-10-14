import { readFileSync } from "node:fs"
import { CliError, type Streams } from "@wirecat/cli-base"
import { type MessageStore, type Note, openStore } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { loadConfig } from "../config.js"
import { collect, positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { subjectOf } from "../people/subject.js"
import { printing } from "../records/run.js"
import { SAVE_HELP } from "../save-help.js"
import { meetingReference } from "../store/scope.js"
import { isNoteReference } from "./about.js"
import { boundFolders, folderOfFile } from "./bound.js"
import { DIALECTS, type DialectName } from "./dialects/index.js"
import { folderNotes } from "./import.js"
import { exportInternal, exportTarget, internalNotes } from "./internal.js"
import { listNotes } from "./list.js"
import { loadFolderState } from "./state.js"

const formatOf = (value: string): DialectName => {
  if (!(DIALECTS as readonly string[]).includes(value)) throw new InvalidArgumentError(`choose ${DIALECTS.join(", ")}`)
  return value as DialectName
}

const sourceOf = (value: string): Note["source"] => {
  if (value !== "file" && value !== "internal") throw new InvalidArgumentError("choose file or internal")
  return value
}

const textOf = (options: { text?: string; file?: string }, given?: string): string => {
  const sources = [given, options.text, options.file].filter((value) => value !== undefined)
  if (sources.length !== 1)
    throw new CliError("validation_error", "give the text once: as an argument, --text or --file")
  if (options.file !== undefined) return readFileSync(options.file === "-" ? 0 : options.file, "utf8")
  return sources[0] as string
}

/** `note:<id>`, `document:<id>`, or a file inside a configured folder. */
const noteOf = async (store: MessageStore, env: NodeJS.ProcessEnv, reference: string): Promise<Note> => {
  if (isNoteReference(reference)) return store.notes.note(reference)
  const { folder, path } = folderOfFile(await boundFolders(store, env, { strict: false }), reference)
  const found = (await folderNotes(store, folder.id)).find((note) => note.path === path)
  if (!found)
    throw new CliError("not_found", `${reference} is not imported — memo sync --notes`, { reason: "note.not-imported" })
  return found
}

export const notesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const print = printing(streams)
  const withStore = async <T>(work: (store: MessageStore) => Promise<T>): Promise<T> => {
    const store = await openStore({ env })
    try {
      await importNotesMap(store, env, await boundFolders(store, env, { strict: false }))
      return await work(store)
    } finally {
      await store.close()
    }
  }
  const notes = program.command("notes").description("notes from your folders, and notes you write here")

  notes
    .command("show")
    .description("one note: its text, tags, what it links and what links it")
    .addHelpText("after", SAVE_HELP)
    .argument("<note>", "note:<id>, document:<id>, or a file in a configured folder")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { json?: boolean }) => {
      const answer = await withStore(async (store) => {
        const note = await noteOf(store, env, reference)
        const ref = note.ref
        const labels = await store.notes.noteTags(ref)
        return {
          ...note,
          ref,
          tags: labels.map(({ tag }) => tag),
          labels,
          links: await store.notes.links({ from: ref }),
          backlinks: await store.notes.links({ to: ref }),
          provenance:
            note.folderId === null
              ? null
              : (loadFolderState(env, note.folderId)?.documents[note.path as string] ?? null),
        }
      })
      print(
        options.json,
        answer,
        [
          `${answer.ref}  ${answer.path ?? answer.title ?? ""}`.trimEnd(),
          `  updated ${new Date(answer.updatedAt).toISOString().slice(0, 16).replace("T", " ")}${answer.tags.length ? `  tags: ${answer.tags.join(", ")}` : ""}`,
          "",
          answer.text,
          ...(answer.links.length ? ["", `links: ${answer.links.map(({ to }) => to).join(", ")}`] : []),
          ...(answer.backlinks.length ? [`linked from: ${answer.backlinks.map(({ from }) => from).join(", ")}`] : []),
        ].join("\n"),
      )
    })

  notes
    .command("list")
    .description("notes, newest first")
    .option("--about <subject>", "only notes about or linking this: <messenger>:<name or id> or a typed reference")
    .option("--source <source>", "file or internal", sourceOf)
    .option("--search <text>", "only notes holding this text, as written")
    .option("--offset <n>", "skip this many", Number, 0)
    .option("--limit <n>", "most notes, at most 500", positive, 20)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
          listNotes(store, {
            limit: options.limit,
            offset: options.offset,
            ...(options.about === undefined ? {} : { about: await subjectOf(store, options.about) }),
            ...(options.source === undefined ? {} : { source: options.source }),
            ...(options.search === undefined ? {} : { search: options.search }),
          }),
        )
        print(
          options.json,
          page,
          page.items
            .map(
              (note) =>
                `${note.ref}  ${note.source}${note.via ? `  ${note.via}` : ""}  ${note.path ?? note.title ?? note.text.split("\n")[0]}${note.anchors?.length ? ` ${note.anchors.join(" ")}` : ""}${note.linkText ? `  as "${note.linkText}"` : ""}`,
            )
            .join("\n") || "No notes.",
        )
      },
    )

  notes
    .command("add")
    .description("write a note of your own about messages, people, projects or other notes")
    .argument("[text]", "the note; or --text, or --file")
    .option("--text <text>", "the note")
    .option("--file <path>", "read the note from a file; - reads stdin")
    .option("--title <title>", "a title")
    .option(
      "--about <subject>",
      "what it is about: <messenger>:<name or id>, msg:, chat:, person:, organization:, project:, task:, note:, document:, meeting:; repeat for more",
      collect,
    )
    .option("--meeting <id>", "also about this meeting, by its store id, with --provider and --account")
    .option("--provider <provider>", "the meeting's provider")
    .option("--account <account>", "the meeting's account")
    .option("--export [dir]", "also write it as a file — to this folder, or notes.export.dir")
    .option("--format <format>", `the file's format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        given: string | undefined,
        options: {
          text?: string
          file?: string
          title?: string
          about?: string[]
          meeting?: string
          provider?: string
          account?: string
          export?: string | true
          format?: DialectName
          json?: boolean
        },
      ) => {
        const body = textOf(options, given)
        if (options.meeting === undefined && (options.provider !== undefined || options.account !== undefined))
          throw new CliError("validation_error", "--provider and --account select the account of --meeting")
        const answer = await withStore(async (store) => {
          const about = await Promise.all(
            (options.about ?? []).map(async (subject) => (await subjectOf(store, subject)).ref),
          )
          if (options.meeting !== undefined) about.push(await meetingReference(store, options.meeting, options))
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
    .description("change a note you wrote here; a file's note is edited in its file")
    .argument("<id>", "note:<id> or its id")
    .requiredOption("--revision <n>", "its current revision, so an edit made meanwhile is not lost", positive)
    .option("--text <text>", "the new text")
    .option("--file <path>", "read the new text from a file; - reads stdin")
    .option("--export [dir]", "also rewrite its file — in this folder, or notes.export.dir")
    .option("--format <format>", `the file's format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
    .description("delete a note you wrote here; a file it was exported to stays")
    .argument("<id>", "note:<id> or its id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, options: { json?: boolean }) => {
      const answer = await withStore((store) => store.notes.removeNote(id.replace(/^note:/, "")))
      print(options.json, answer, `${answer.id} removed`)
    })

  notes
    .command("export")
    .description("write the notes you wrote here as files, never overwriting one you edited")
    .option("--to <dir>", "the folder to write to (default: notes.export.dir)")
    .option("--format <format>", `the files' format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
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
