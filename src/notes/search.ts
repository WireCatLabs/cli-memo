import { basename, resolve } from "node:path"
import { CliError } from "@leemour/cli-core"
import { formatLocator, normalizeTag } from "@leemour/cli-messaging"
import { embeddingsService, searchStore, storeOnlyDeps } from "@leemour/cli-messaging/services"
import type { MessageStore } from "@leemour/cli-messaging/store"
import { APP } from "../app.js"
import type { NotesMap } from "../people/notes-map.js"
import { type ResolvedLink, resolveLinks } from "./links.js"
import { linkTargets } from "./read.js"

export interface NoteHit {
  locator: string
  /** The note's path inside its folder. */
  path: string
  folder: string
  modifiedAt: string
  /** The first line holding a word of the query. */
  line: string
  /** How it was found: by meaning (its embedded chunks), by words, or both. */
  by: ("meaning" | "words")[]
  links?: ResolvedLink[]
  provenance?: unknown
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
  tag?: string
  /** `words`: no folder was embedded or the model is not downloaded, so only words were searched. */
  meaning: "searched" | "words"
  hits: NoteHit[]
  hasMore: boolean
  nextOffset?: number
  truncated?: boolean
  filter?: string
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
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 2 && !["and", "or", "not"].includes(word))
  const lines = text.split("\n").slice(2)
  const found = lines.find((line) => words.some((word) => line.toLowerCase().includes(word)))
  return (found ?? lines.find((line) => line.trim() !== "") ?? "").trim().slice(0, MAX_LINE)
}

export const searchNotes = async (
  store: MessageStore,
  query: string,
  {
    limit = 20,
    offset = 0,
    notesMap = {},
    tag,
    filter: expression,
    wordsOnly = false,
    folders: selectedFolders,
  }: {
    limit?: number
    offset?: number
    notesMap?: NotesMap
    tag?: string
    filter?: string
    wordsOnly?: boolean
    folders?: string[]
  } = {},
): Promise<NotesSearch> => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000)
    throw new CliError("validation_error", "limit takes 1–100 and offset takes 0–1000")
  const label = tag === undefined ? undefined : normalizeTag(tag)
  const filter =
    [expression ? `(${expression})` : "", label === undefined ? "" : `tag:${label}`].filter(Boolean).join(" AND ") ||
    undefined
  const folders = (await store.accounts()).filter(
    ({ provider, account }) =>
      provider === "notes" && (selectedFolders === undefined || selectedFolders.includes(account)),
  )
  if (folders.length > 50) throw new CliError("validation_error", "select at most 50 folders explicitly")
  const candidates = Math.min(2000, Math.max(100, (offset + limit + 1) * 8))
  let truncated = false
  const found: { key: (typeof folders)[number]; id: string; chatId: string; by: NoteHit["by"]; score: number }[] = []
  let meaning: NotesSearch["meaning"] = "words"
  for (const key of folders) {
    if (wordsOnly) {
      const foundWords = await searchStore(store, key, {
        text: [query.trim() ? `(${query})` : "", filter].filter(Boolean).join(" AND "),
        language: "lucene",
        accounts: [key],
        limit: candidates,
      })
      truncated ||= foundWords.hasMore
      for (const [rank, hit] of foundWords.items.entries())
        found.push({ key, id: hit.id, chatId: hit.chatId, by: ["words"], score: 1 / (rank + 1) })
      continue
    }
    const answer = await embeddingsService(storeOnlyDeps(store, key, { app: APP })).search(query, {
      limit: candidates,
      ...(filter === undefined ? {} : { filter }),
    })
    truncated ||= answer.hits.length === candidates
    if (answer.meaning === "searched" && answer.hits.some(({ by }) => by.includes("meaning"))) meaning = "searched"
    for (const hit of answer.hits)
      found.push({
        key,
        id: hit.chunk.firstMessageId,
        chatId: hit.summary.chatId,
        by: hit.by,
        score: hit.score ?? 0,
      })
  }
  found.sort(
    (a, b) =>
      b.by.length - a.by.length ||
      b.score - a.score ||
      a.key.account.localeCompare(b.key.account) ||
      a.id.localeCompare(b.id),
  )
  const deduplicated = new Map<string, (typeof found)[number]>()
  for (const hit of found) {
    const locator = formatLocator({ ...hit.key, chat: hit.chatId, message: hit.id })
    if (!deduplicated.has(locator)) deduplicated.set(locator, hit)
  }
  const unique = [...deduplicated.values()]
  const documents = new Map<string, { path: string; text: string }[]>()
  for (const key of folders) {
    const page = await store.find({ account: key, pattern: /[\s\S]?/, limit: 2001 })
    truncated ||= page.hasMore || page.items.length > 2000
    documents.set(
      key.account,
      page.items.slice(0, 2000).map((message) => ({ path: message.id, text: message.text })),
    )
  }
  const items = (
    await Promise.all(
      unique.slice(offset, offset + limit).map(async ({ key, id, chatId, by }) => {
        const message = await store.message(key, id, { chatId })
        return message === undefined ? [] : [{ key, message, by }]
      }),
    )
  ).flat()
  const page = { items: items.map(({ message }) => message), hasMore: unique.length > offset + limit }
  const hits = await Promise.all(
    items.map(async ({ key, message, by }) => ({
      locator: formatLocator({
        provider: key.provider,
        account: key.account,
        chat: message.chatId,
        message: message.id,
      }),
      path: message.id,
      folder: key.account,
      modifiedAt: message.timestamp,
      line: firstLine(message.text, query),
      by,
      links: resolveLinks({ path: message.id, text: message.text }, documents.get(key.account) ?? []),
      ...((await store.syncState(key, `document:${message.id}`))?.value
        ? { provenance: JSON.parse((await store.syncState(key, `document:${message.id}`))?.value as string) }
        : {}),
    })),
  )

  const personOfNote = new Map<string, Set<string>>()
  const uncertain = new Set<string>()
  for (const hit of hits)
    for (const link of hit.links ?? []) {
      const name = basename(link.target)
      if (link.status !== "resolved" || !link.paths[0]) {
        uncertain.add(name)
        continue
      }
      const actual = resolve(hit.folder, link.paths[0])
      const uids = Object.entries(notesMap)
        .filter(([, path]) => resolve(path) === actual)
        .map(([uid]) => uid)
      if (!uids.length) uncertain.add(name)
      const linked = personOfNote.get(name) ?? new Set<string>()
      for (const uid of uids) linked.add(uid)
      personOfNote.set(name, linked)
    }
  const counts = new Map<string, number>()
  for (const hit of page.items) {
    for (const name of new Set(hit.text.split("\n").flatMap(linkTargets))) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const linked = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, notes]) => ({
      name,
      notes,
      person:
        !uncertain.has(name) && personOfNote.get(name)?.size === 1
          ? ([...(personOfNote.get(name) ?? [])][0] ?? null)
          : null,
    }))

  const mentioned = (await knownPeople(store))
    .map(({ pattern, ...person }) => ({ ...person, notes: page.items.filter(({ text }) => pattern.test(text)).length }))
    .filter(({ name, notes }) => notes > 0 && !counts.has(name))
    .sort((a, b) => b.notes - a.notes || a.name.localeCompare(b.name))

  return {
    query,
    ...(label === undefined ? {} : { tag: label }),
    meaning,
    hits,
    hasMore: page.hasMore,
    ...(page.hasMore && offset + limit <= 1000 ? { nextOffset: offset + limit } : {}),
    ...(truncated || (page.hasMore && offset + limit > 1000) ? { truncated: true } : {}),
    ...(filter === undefined ? {} : { filter }),
    linked,
    mentioned,
  }
}
