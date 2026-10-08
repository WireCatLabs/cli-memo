import {
  bareReferences,
  dropNoteExtension,
  isReference,
  parsedNote,
  renderNote,
  splitFrontMatter,
  withoutCode,
} from "./common.js"
import { markdownLink, markdownLinks, stripMarkdownLinks } from "./markdown.js"
import type { NoteDialect, NoteLink } from "./types.js"

const WIKI = /!?\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g
const TAG = /(?<![\p{L}\p{N}_#&/])#([\p{L}_][\p{L}\p{N}_/-]*)/gu

export const wikiLinks = (body: string): NoteLink[] =>
  [...withoutCode(body).matchAll(WIKI)].map((match) => {
    const raw = (match[1] ?? "").trim()
    const label = match[2]?.trim() || null
    if (isReference(raw)) return { target: raw, anchor: null, label }
    const split = raw.search(/[#^]/)
    return {
      target: dropNoteExtension(split < 0 ? raw : raw.slice(0, split)).trim(),
      anchor: split < 0 ? null : raw.slice(split),
      label,
    }
  })

/** Obsidian reads `#tag` anywhere in the text except code, links and headings. */
export const inlineTags = (body: string): string[] => [
  ...new Set(
    [...stripMarkdownLinks(withoutCode(body).replace(WIKI, " ")).matchAll(TAG)].map((match) => match[1] ?? ""),
  ),
]

const wikiLink = (link: NoteLink): string =>
  isReference(link.target)
    ? markdownLink(link)
    : `[[${link.target}${link.anchor ?? ""}${link.label ? `|${link.label}` : ""}]]`

export const obsidian: NoteDialect = {
  name: "obsidian",
  parse(text, path) {
    const { frontMatter, body } = splitFrontMatter(text)
    const rest = stripMarkdownLinks(withoutCode(body).replace(WIKI, " "))
    return parsedNote(
      frontMatter,
      body,
      path,
      [...wikiLinks(body), ...markdownLinks(body), ...bareReferences(rest)],
      inlineTags(body),
    )
  },
  render: (note) => renderNote(note, wikiLink),
}
