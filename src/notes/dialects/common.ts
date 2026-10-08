import { posix } from "node:path"
import { parse, stringify } from "yaml"
import type { NoteForExport, NoteLink, ParsedNote } from "./types.js"

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const REFERENCE = /^(msg|note|person|entity|task|chat|contact):\S+$/
const BARE_REFERENCE = /(?<![\w/:])((?:msg|note|person|entity|task|chat|contact):[^\s<>()[\]"'`]+)/g
const MAX_LINKS = 200

export const isReference = (target: string): boolean => REFERENCE.test(target)

export const splitFrontMatter = (text: string): { frontMatter: Record<string, unknown>; body: string } => {
  const match = FRONT_MATTER.exec(text)
  if (!match) return { frontMatter: {}, body: text }
  let data: unknown
  try {
    data = parse(match[1] ?? "")
  } catch {
    data = null
  }
  const frontMatter = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {}
  return { frontMatter: frontMatter as Record<string, unknown>, body: text.slice(match[0].length) }
}

const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
      : []

export const frontMatterAliases = (frontMatter: Record<string, unknown>): string[] => {
  const value = frontMatter.aliases ?? frontMatter.alias
  return typeof value === "string" ? [value.trim()] : strings(value)
}

export const frontMatterTags = (frontMatter: Record<string, unknown>): string[] =>
  strings(frontMatter.tags ?? frontMatter.tag).map((tag) => tag.replace(/^#/, ""))

/** Code says what a reader typed into a fence, not what the note links to or is tagged with. */
export const withoutCode = (body: string): string =>
  body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "")

export const titleOf = (frontMatter: Record<string, unknown>, body: string, path: string): string => {
  if (typeof frontMatter.title === "string" && frontMatter.title.trim()) return frontMatter.title.trim()
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(withoutCode(body))?.[1]
  return heading ?? posix.basename(path.replace(/\\/g, "/")).replace(/\.[^./]+$/, "")
}

export const dropNoteExtension = (target: string): string => target.replace(/\.(md|markdown)$/i, "")

/** `msg:…` written in the text with no link syntax around it. */
export const bareReferences = (body: string): NoteLink[] =>
  [...body.matchAll(BARE_REFERENCE)].map((match) => ({
    target: (match[1] ?? "").replace(/[.,;:!?]+$/, ""),
    anchor: null,
    label: null,
  }))

export const dedupe = (links: NoteLink[]): NoteLink[] => {
  const seen = new Set<string>()
  return links
    .filter((link) => {
      const key = `${link.target}\u0000${link.anchor ?? ""}\u0000${link.label ?? ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_LINKS)
}

export const parsedNote = (
  frontMatter: Record<string, unknown>,
  body: string,
  path: string,
  links: NoteLink[],
  inlineTags: string[] = [],
): ParsedNote => ({
  title: titleOf(frontMatter, body, path),
  aliases: frontMatterAliases(frontMatter),
  tags: [...new Set([...frontMatterTags(frontMatter), ...inlineTags])],
  links: dedupe(links),
  frontMatter,
})

export const renderNote = (note: NoteForExport, link: (link: NoteLink) => string): string => {
  const frontMatter = {
    ...note.frontMatter,
    ...(note.aliases.length ? { aliases: note.aliases } : {}),
    ...(note.tags.length ? { tags: note.tags } : {}),
  }
  const head = Object.keys(frontMatter).length ? `---\n${stringify(frontMatter).trimEnd()}\n---\n` : ""
  const links = note.links.length ? `\n\n${note.links.map((item) => `- ${link(item)}`).join("\n")}` : ""
  return `${head}# ${note.title}\n\n${note.text.trimEnd()}${links}\n`
}
