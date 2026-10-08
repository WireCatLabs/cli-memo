import type { NotesFound as NotesSearch } from "@leemour/cli-messaging/services"

export type { FoundNote as NoteHit, LinkedRecord, NotesFound as NotesSearch } from "@leemour/cli-messaging/services"
export { searchNotes } from "@leemour/cli-messaging/services"

export const searchText = (result: NotesSearch): string =>
  [
    ...(result.hits.length === 0
      ? [
          result.tag === undefined
            ? `No note holds "${result.query}". Run memo notes import if notes changed.`
            : `No note tagged ${result.tag} matches "${result.query}".`,
        ]
      : []),
    ...result.hits.map(
      (hit) => `${hit.path ?? hit.ref}${hit.foundBy.includes("words") ? "" : "  (by meaning)"}\n  ${hit.line}`,
    ),
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
