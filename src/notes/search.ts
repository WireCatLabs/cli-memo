import type { NotesFound as NotesSearch } from "@wirecat/cli-core/services"

export type { FoundNote as NoteHit, LinkedRecord, NotesFound as NotesSearch } from "@wirecat/cli-core/services"
export { searchNotes } from "@wirecat/cli-core/services"

export const searchText = (result: NotesSearch): string =>
  [
    ...(result.hits.length === 0
      ? [
          result.tag === undefined
            ? `No note holds "${result.query}". Run memo sync --notes if notes changed.`
            : `No note tagged ${result.tag} matches "${result.query}".`,
        ]
      : []),
    ...result.hits.map(
      (hit) =>
        `${"key" in hit ? "key  " : ""}${hit.path ?? hit.ref}${hit.found_by.includes("words") ? "" : "  (by meaning)"}\n  ${hit.excerpt}`,
    ),
    ...(result.has_more ? ["More notes match; raise --limit or continue with --offset."] : []),
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
