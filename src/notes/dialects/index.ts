import { markdown } from "./markdown.js"
import { obsidian } from "./obsidian.js"
import type { DialectName, NoteDialect } from "./types.js"

const BY_NAME: Record<DialectName, NoteDialect> = { obsidian, markdown }

export const dialectOf = (name: DialectName = "obsidian"): NoteDialect => BY_NAME[name]

export type { DialectName, NoteDialect, NoteForExport, NoteLink, ParsedNote } from "./types.js"
export { DIALECTS } from "./types.js"
