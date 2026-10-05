import { basename } from "node:path"
import type { MessageStore } from "@leemour/cli-messaging/store"
import type { NotesMap } from "../people/notes-map.js"
import { linkTargets } from "./read.js"

export interface NoteHit {
  locator: string
  /** The note's path inside its folder. */
  path: string
  folder: string
  modifiedAt: string
  /** The first line holding a word of the query. */
  line: string
}

export interface LinkedPerson {
  name: string
  /** How many of the notes found link them. */
  notes: number
  /** The store's person, when `memo note` named this note as theirs. */
  person: string | null
}

/** A person the store knows whose full name appears in the notes found — by name only, so a guess. */
export interface MentionedPerson {
  provider: string
  id: string
  name: string
  notes: number
}

export interface NotesSearch {
  query: string
  hits: NoteHit[]
  hasMore: boolean
  /** Who the notes found link with `[[Name]]`, most linked first: people pages, and other notes too. */
  linked: LinkedPerson[]
  /** Weak: the same name can belong to someone else. */
  mentioned: MentionedPerson[]
}

const MAX_LINE = 200
/** Shorter names, or a single word, match too much ordinary text to mean anyone. */
const MIN_NAME = 5

const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const knownPeople = async (store: MessageStore) => {
  const providers = new Set((await store.accounts()).map(({ provider }) => provider).filter((p) => p !== "notes"))
  const people: { provider: string; id: string; name: string; pattern: RegExp }[] = []
  for (const provider of providers) {
    for (const contact of (await store.people(provider)).all()) {
      const name = contact.name?.trim()
      if (!name || name.length < MIN_NAME || !/\s/.test(name)) continue
      people.push({
        provider,
        id: contact.id,
        name,
        pattern: new RegExp(`(?<![\\p{L}\\p{N}])${literal(name)}(?![\\p{L}\\p{N}])`, "iu"),
      })
    }
  }
  return people
}

const firstLine = (text: string, query: string): string => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2)
  const lines = text.split("\n").slice(2)
  const found = lines.find((line) => words.some((word) => line.toLowerCase().includes(word)))
  return (found ?? lines.find((line) => line.trim() !== "") ?? "").trim().slice(0, MAX_LINE)
}

export const searchNotes = async (
  store: MessageStore,
  query: string,
  { limit = 20, notesMap = {} }: { limit?: number; notesMap?: NotesMap } = {},
): Promise<NotesSearch> => {
  const page = await store.find({ provider: "notes", text: query, limit })
  const hits = page.items.map((hit) => ({
    locator: hit.locator,
    path: hit.id,
    folder: decodeURIComponent(hit.locator.split("/")[1] ?? ""),
    modifiedAt: hit.timestamp,
    line: firstLine(hit.text, query),
  }))

  const personOfNote = new Map(
    Object.entries(notesMap).map(([uid, path]) => [basename(path).replace(/\.md$/i, ""), uid]),
  )
  const counts = new Map<string, number>()
  for (const hit of page.items) {
    for (const name of new Set(hit.text.split("\n").flatMap(linkTargets))) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const linked = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, notes]) => ({ name, notes, person: personOfNote.get(name) ?? null }))

  const mentioned = (await knownPeople(store))
    .map(({ pattern, ...person }) => ({ ...person, notes: page.items.filter(({ text }) => pattern.test(text)).length }))
    .filter(({ name, notes }) => notes > 0 && !counts.has(name))
    .sort((a, b) => b.notes - a.notes || a.name.localeCompare(b.name))

  return { query, hits, hasMore: page.hasMore, linked, mentioned }
}
