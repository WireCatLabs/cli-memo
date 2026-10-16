import { readFileSync } from "node:fs"
import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { MessageStore, Note } from "@wirecat/cli-core/store"
import { type Command, InvalidArgumentError } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { loadConfig } from "../config.js"
import { collect, positive } from "../options.js"
import { importNotesMap } from "../people/notes-map.js"
import { subjectOf } from "../people/subject.js"
import { SAVE_HELP } from "../save-help.js"
import { meetingReference } from "../store/scope.js"
import { isNoteReference } from "./about.js"
import { boundFolders, folderOfFile } from "./bound.js"
import { DIALECTS, type DialectName } from "./dialects/index.js"
import type { ExportResult } from "./export.js"
import { folderNotes } from "./import.js"
import { exportInternal, exportTarget, internalNotes } from "./internal.js"
import { listNotes } from "./list.js"

const formatOf = (value: string): DialectName => {
  if (!(DIALECTS as readonly string[]).includes(value)) throw new InvalidArgumentError(`choose ${DIALECTS.join(", ")}`)
  return value as DialectName
}

const NOTES_LIST_QUERY = {
  entity: "note",
  backend: "native",
  fields: [
    termField("about", "ref", 'about:"telegram:Kai Sample"', {
      relation: "notes about it or linking it: <messenger>:<name or id> or a typed reference; stands alone",
    }),
    termField("source", "enum", "source:internal", { values: ["file", "internal"] }),
    termField("text", "txt", "text:budget"),
  ],
} as const satisfies QueryRegistry

const textOf = (options: { text?: string; textFile?: string }, given?: string): string => {
  const sources = [given, options.text, options.textFile].filter((value) => value !== undefined)
  if (sources.length !== 1)
    throw new CliError("validation_error", "give the text once: as an argument, --text or --text-file")
  if (options.textFile !== undefined) return readFileSync(options.textFile === "-" ? 0 : options.textFile, "utf8")
  return sources[0] as string
}

/** `note:<id>`, `document:<id>`, or a file inside a configured folder. */
const noteOf = async (store: MessageStore, env: NodeJS.ProcessEnv, reference: string): Promise<Note> => {
  if (isNoteReference(reference)) return store.notes.note(reference)
  const { folder, path } = folderOfFile(await boundFolders(store, env, { strict: false }), reference)
  const found = (await folderNotes(store, folder.id)).find((note) => note.path === path)
  if (!found)
    throw new CliError("not_found", `${reference} is not imported — memo sync --only notes`, {
      reason: "note.not-imported",
    })
  return found
}

export const notesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  // The note's own export_path says where it was written; a file edited since is left as it is, and said so.
  const exportedPath = ({ written, unchanged, edited }: ExportResult): string | null => {
    for (const { path } of edited) streams.diagnostic(`Edited since export, left as it is: ${path}\n`)
    return written[0] ?? unchanged[0] ?? edited[0]?.path ?? null
  }
  const withNotes = <T>(work: (store: MessageStore) => Promise<T>): Promise<T> =>
    withStore(env, async (store) => {
      await importNotesMap(store, env, await boundFolders(store, env, { strict: false }))
      return work(store)
    })
  const notes = program.command("notes").description("notes from your folders, and notes you write here")

  annotate(notes.command("show"), { effects: LOCAL_READ, output: { entity: "note" } })
    .description("one note: its text, tags, what it links and what links it")
    .addHelpText("after", SAVE_HELP)
    .argument("<note>", "note:<id>, document:<id>, or a file in a configured folder")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { json?: boolean }) => {
      const answer = await withNotes(async (store) => {
        const note = await noteOf(store, env, reference)
        const ref = note.ref
        return {
          ...note,
          ref,
          tags: (await store.notes.noteTags(ref)).map(({ tag }) => tag),
          links: (await store.notes.links({ from: ref })).map(({ to, targetText, kind, anchor }) => ({
            to,
            targetText,
            kind,
            anchor,
          })),
          backlinks: (await store.notes.links({ to: ref })).map(({ from, targetText, kind, anchor }) => ({
            from,
            targetText,
            kind,
            anchor,
          })),
        }
      })
      print(
        options.json,
        itemAnswer(answer),
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

  withQuery(
    annotate(notes.command("list"), { effects: LOCAL_READ }).description("notes, newest first"),
    NOTES_LIST_QUERY,
  )
    .option("--limit <n>", "most notes, at most 500", positive, 20)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], { json, ...paging }: { limit: number; page: number; json?: boolean }) => {
      const terms = queryTerms(words, NOTES_LIST_QUERY, "notes list")
      const about = terms.get("about")
      const source = terms.get("source") as Note["source"] | undefined
      const search = terms.get("text")
      if (about !== undefined && terms.size > 1)
        throw new CliError("validation_error", "about: stands alone in notes list: its notes are found through links")
      const options = { ...paging, json }
      const page = await withNotes(async (store) =>
        listNotes(store, {
          limit: options.limit,
          offset: (options.page - 1) * options.limit,
          ...(about === undefined
            ? { ...(source === undefined ? {} : { source }), ...(search === undefined ? {} : { search }) }
            : { about: await subjectOf(store, about) }),
        }),
      )
      print(
        options.json,
        listAnswer("notes list", {
          items: page.items,
          limit: options.limit,
          has_more: page.hasMore,
          page: options.page,
          ...(words.length === 0 ? {} : { args: { query: words.join(" ") } }),
        }),
        page.items
          .map(
            (note) =>
              `${note.ref}  ${note.source}${note.via ? `  ${note.via}` : ""}  ${note.path ?? note.title ?? note.text.split("\n")[0]}${note.anchors?.length ? ` ${note.anchors.join(" ")}` : ""}${note.linkText ? `  as "${note.linkText}"` : ""}`,
          )
          .join("\n") || "No notes.",
      )
    })

  annotate(notes.command("add"), { effects: LOCAL_WRITE, output: { entity: "note" } })
    .description("write a note of your own about messages, people, projects or other notes")
    .argument("[text]", "the note; or --text, or --text-file")
    .option("--text <text>", "the note")
    .option("--text-file <path>", "read the note from a file; - reads stdin")
    .option("--title <title>", "a title")
    .option(
      "--subject <ref>",
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
          textFile?: string
          title?: string
          subject?: string[]
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
        const answer = await withNotes(async (store) => {
          const about = await Promise.all(
            (options.subject ?? []).map(async (subject) => (await subjectOf(store, subject)).ref),
          )
          if (options.meeting !== undefined) about.push(await meetingReference(store, options.meeting, options))
          const note = await store.notes.addNote({
            text: body,
            about,
            ...(options.title === undefined ? {} : { title: options.title }),
          })
          if (options.export === undefined) return note
          const target = exportTarget(loadConfig(env), options.export, options.format)
          return { ...note, exportPath: exportedPath(await exportInternal(store, { ...target, notes: [note] })) }
        })
        print(options.json, itemAnswer(answer), answer.id)
      },
    )

  annotate(notes.command("edit"), { effects: LOCAL_WRITE, output: { entity: "note" } })
    .description("change a note you wrote here; a file's note is edited in its file")
    .argument("<id>", "note:<id> or its id")
    .requiredOption("--revision <n>", "its current revision, so an edit made meanwhile is not lost", positive)
    .option("--text <text>", "the new text")
    .option("--text-file <path>", "read the new text from a file; - reads stdin")
    .option("--export [dir]", "also rewrite its file — in this folder, or notes.export.dir")
    .option("--format <format>", `the file's format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(
      async (
        id: string,
        options: {
          revision: number
          text?: string
          textFile?: string
          export?: string | true
          format?: DialectName
          json?: boolean
        },
      ) => {
        const body = textOf(options)
        const answer = await withNotes(async (store) => {
          const note = await store.notes.editNote(id.replace(/^note:/, ""), body, options.revision)
          if (options.export === undefined) return note
          const target = exportTarget(loadConfig(env), options.export, options.format)
          return { ...note, exportPath: exportedPath(await exportInternal(store, { ...target, notes: [note] })) }
        })
        print(options.json, itemAnswer(answer), `${answer.id} revision ${answer.revision}`)
      },
    )

  annotate(notes.command("remove"), { effects: LOCAL_WRITE })
    .description("delete a note you wrote here; a file it was exported to stays")
    .argument("<id>", "note:<id> or its id")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (id: string, options: { json?: boolean }) => {
      const answer = await withNotes((store) => store.notes.removeNote(id.replace(/^note:/, "")))
      print(options.json, itemAnswer(answer), `${answer.id} removed`)
    })

  annotate(notes.command("export"), { effects: LOCAL_WRITE })
    .description("write the notes you wrote here as files, never overwriting one you edited")
    .option("--output-dir <dir>", "the folder to write to (default: notes.export.dir)")
    .option("--format <format>", `the files' format: ${DIALECTS.join(", ")}`, formatOf)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { outputDir?: string; format?: DialectName; json?: boolean }) => {
      const target = exportTarget(loadConfig(env), options.outputDir, options.format)
      const result = await withNotes(async (store) =>
        exportInternal(store, { ...target, notes: await internalNotes(store) }),
      )
      print(
        options.json,
        itemAnswer(result),
        [
          `${result.dir}: ${result.written.length} written, ${result.unchanged.length} unchanged`,
          ...result.edited.map(({ path }) => `Edited since export, left as it is: ${path}`),
        ].join("\n"),
      )
    })
}
