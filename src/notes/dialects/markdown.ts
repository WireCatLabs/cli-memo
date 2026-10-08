import { NOTE_EXTENSIONS } from "../files.js"
import {
  bareReferences,
  dropNoteExtension,
  isReference,
  parsedNote,
  renderNote,
  splitFrontMatter,
  withoutCode,
} from "./common.js"
import type { NoteDialect, NoteLink } from "./types.js"

const LINK = /(?<!!)\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const linkOf = (label: string, destination: string): NoteLink | null => {
  const angled = destination.startsWith("<") && destination.endsWith(">")
  const raw = angled ? destination.slice(1, -1) : destination
  if (isReference(raw)) return { target: raw, anchor: null, label: label.trim() || null }
  if (SCHEME.test(raw)) return null
  const hash = raw.indexOf("#")
  const path = hash < 0 ? raw : raw.slice(0, hash)
  const fragment = hash < 0 ? null : raw.slice(hash + 1)
  return {
    target: dropNoteExtension(angled ? path : decode(path)).trim(),
    anchor: fragment === null ? null : `#${angled ? fragment : decode(fragment)}`,
    label: label.trim() || null,
  }
}

/** `[label](path.md#Heading)` and `[label](person:…)`; web links are not notes and are left out. */
export const markdownLinks = (body: string): NoteLink[] =>
  [...withoutCode(body).matchAll(LINK)]
    .map((match) => linkOf(match[1] ?? "", match[2] ?? ""))
    .filter((link): link is NoteLink => link !== null)

export const stripMarkdownLinks = (body: string): string => body.replace(LINK, " ")

const hasOwnExtension = (target: string): boolean =>
  NOTE_EXTENSIONS.some((extension) => target.toLowerCase().endsWith(extension))

export const markdownLink = (link: NoteLink): string => {
  if (isReference(link.target)) return `[${link.label ?? link.target}](${link.target})`
  const file = hasOwnExtension(link.target) ? link.target : `${link.target}.md`
  const label = link.label ?? link.target.split("/").pop() ?? link.target
  return `[${label}](<${file}${link.anchor ?? ""}>)`
}

export const markdown: NoteDialect = {
  name: "markdown",
  parse(text, path) {
    const { frontMatter, body } = splitFrontMatter(text)
    const links = markdownLinks(body)
    return parsedNote(frontMatter, body, path, [...links, ...bareReferences(withoutCode(stripMarkdownLinks(body)))])
  },
  render: (note) => renderNote(note, markdownLink),
}
