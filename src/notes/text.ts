import type { NoteMention, NotesAnswer } from "./read.js"

const mentions = (title: string, items: NoteMention[]): string[] =>
  items.length === 0 ? [] : [title, ...items.map((item) => `  ${item.path}:${item.line}  ${item.text}`), ""]

export const notesText = (answer: NotesAnswer): string =>
  [
    ...(answer.about.length === 0
      ? [`No note about ${answer.name}.`, ""]
      : ["About", ...answer.about.map((note) => `  ${note.path}`), ""]),
    ...mentions("Linked", answer.links),
    ...mentions("Plain-name mentions (weak: may be someone else)", answer.weak),
    ...(answer.hasMore ? ["More were found; raise --limit to see them.", ""] : []),
    ...answer.notRead.map(({ folder, reason }) => `Not read: ${folder || "notes"} — ${reason}`),
  ]
    .join("\n")
    .trimEnd()
