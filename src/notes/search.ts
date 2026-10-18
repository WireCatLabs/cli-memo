import type { NotesFound as NotesSearch } from "@wirecat/cli-core/services"

export type { FoundNote as NoteHit, LinkedRecord, NotesFound as NotesSearch } from "@wirecat/cli-core/services"
export { searchNotes } from "@wirecat/cli-core/services"

export const searchText = (result: NotesSearch): string =>
  [
    ...(result.hits.length === 0
      ? [`No note holds "${result.query}". Run memo sync --only notes if notes changed.`]
      : []),
    ...result.hits.map(
      (hit) =>
        `${"key" in hit ? "key  " : ""}${hit.path ?? hit.ref}${hit.found_by.length === 1 && hit.found_by[0] === "meaning" ? "  (by meaning)" : ""}\n  ${hit.excerpt}`,
    ),
    ...(result.has_more ? ["More notes match; raise --limit or ask for --page with the next number."] : []),
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
