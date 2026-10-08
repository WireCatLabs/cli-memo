import { resolve } from "node:path"
import { CliError } from "@leemour/cli-core"
import type { MessageStore, Note } from "@leemour/cli-messaging/store"
import type { Config } from "../config.js"
import { ownerKey } from "../store/owner.js"
import { type DialectName, dialectOf } from "./dialects/index.js"
import { type ExportedNote, type ExportResult, exportNotes } from "./export.js"

const PAGE = 500
const MAX_TITLE = 80

export const internalNotes = async (store: MessageStore): Promise<Note[]> => {
  const notes: Note[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.notes.notes({ source: "internal", limit: PAGE, offset })
    notes.push(...page.items)
    if (!page.hasMore) return notes
  }
}

const titleOf = (note: Note) =>
  note.title ??
  (note.text
    .split("\n")
    .find((line) => line.trim())
    ?.trim()
    .slice(0, MAX_TITLE) ||
    note.id)

/** Where an export goes: the folder given, else the config's `notes.export`. */
export const exportTarget = (
  config: Config,
  dir: string | true | undefined,
  format: DialectName | undefined,
): { dir: string; format: DialectName } => {
  const chosen = typeof dir === "string" ? dir : config.notes?.export?.dir
  if (chosen === undefined)
    throw new CliError(
      "configuration_error",
      "name a folder — --to <dir>, --export <dir>, or notes.export.dir in the config",
    )
  return { dir: resolve(chosen), format: format ?? config.notes?.export?.format ?? "obsidian" }
}

/** Writes internal notes as files, each with what it is about as links and its tags. */
export const exportInternal = async (
  store: MessageStore,
  { dir, format, notes }: { dir: string; format: DialectName; notes: Note[] },
): Promise<ExportResult> => {
  const owner = await ownerKey(store)
  const exported: ExportedNote[] = []
  for (const note of notes) {
    const about = (await store.notes.links({ from: `note:${note.id}` })).filter((link) => link.to !== null)
    exported.push({
      id: note.id,
      title: titleOf(note),
      text: note.text,
      aliases: [],
      tags: owner ? await store.knowledge.tags(owner, { type: "note", id: note.id }) : [],
      links: about.map((link) => ({ target: link.to as string, anchor: link.anchor, label: null })),
      frontMatter: {},
    })
  }
  return exportNotes({ dir, dialect: dialectOf(format), notes: exported })
}
