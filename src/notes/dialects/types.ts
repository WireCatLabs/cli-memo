/**
 * What a note says, in no editor's syntax. A dialect turns a file into this and back; nothing above
 * the dialect ever sees `[[…]]` or `[…](…)`.
 */
export interface NoteLink {
  /**
   * A note as written, extension dropped (`People/Rin`, `../Rin`), or a typed reference
   * (`person:…`, `msg:…`) when the link names a record instead of a file.
   */
  target: string
  /** `#Heading` or `#^block`, when the link points inside the note. */
  anchor: string | null
  label: string | null
}

export interface ParsedNote {
  title: string
  aliases: string[]
  /** As written, without `#`; a nested Obsidian tag keeps its `/`. */
  tags: string[]
  links: NoteLink[]
  frontMatter: Record<string, unknown>
}

export interface NoteForExport {
  title: string
  text: string
  aliases: string[]
  tags: string[]
  /** Links the text does not already carry; written after it. */
  links: NoteLink[]
  frontMatter: Record<string, unknown>
}

export const DIALECTS = ["obsidian", "markdown"] as const
export type DialectName = (typeof DIALECTS)[number]

export interface NoteDialect {
  name: DialectName
  parse(text: string, path: string): ParsedNote
  render(note: NoteForExport): string
}
