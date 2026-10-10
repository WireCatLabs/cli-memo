import { CliError } from "@wirecat/cli-core"
import {
  conversationsService,
  embeddingsService,
  embedNotes as embedNoteChunksOf,
  storeOnlyDeps,
} from "@wirecat/cli-messaging/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-messaging/store"
import { APP } from "../app.js"

/** About three chunks a second with e5-small on this laptop (2026-10-06): a run stays near three minutes, under a five-minute timer, and the next resumes. */
export const EMBED_PER_RUN = 600

export interface NotesEmbedded {
  chats: number
  chunks: number
  /** Chunks left for the next run, when the run's bound stopped it. */
  left: boolean
  /** Why nothing was embedded, when nothing could be. */
  notEmbedded?: string
  pendingChats?: string[]
}

const isMissingModel = (error: unknown): boolean =>
  error instanceof CliError && error.code === "not_found" && /is not downloaded/.test(error.message)

/**
 * Builds each chat's conversations (one per note) — what search by words and by meaning both read — and,
 * unless `embed` is off, embeds the chunks that have no vector yet. Chunks are
 * keyed by their text's hash, so an unchanged note is never embedded twice. A missing model is reported,
 * never downloaded.
 */
export const embedNotes = async (
  store: MessageStore,
  key: AccountKey,
  chats: string[],
  {
    maxChunks = EMBED_PER_RUN,
    embed = true,
    env,
  }: { maxChunks?: number; embed?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<NotesEmbedded> => {
  const deps = storeOnlyDeps(store, key, { app: APP, ...(env === undefined ? {} : { env }) })
  const conversations = conversationsService(deps)
  const embeddings = embeddingsService(deps)
  for (const chat of chats) {
    await conversations.build(chat).catch((error: unknown) => {
      // A folder whose every note was deleted has nothing left to build.
      if (!(error instanceof CliError && error.code === "not_found")) throw error
    })
  }
  let chunks = 0
  let left = false
  const pendingChats: string[] = []
  for (const [index, chat] of (embed ? chats : []).entries()) {
    if (chunks >= maxChunks) {
      left = true
      pendingChats.push(...chats.slice(index))
      break
    }
    try {
      const done = await embeddings.embed(chat, { maxChunks: maxChunks - chunks })
      chunks += done.embedded
      if ((await embeddings.status(chat)).left > 0) {
        left = true
        pendingChats.push(chat)
      }
    } catch (error) {
      if (!isMissingModel(error)) throw error
      return {
        chats: chats.length,
        chunks,
        left: true,
        notEmbedded: "the e5-small model is not downloaded — tg models text download e5-small",
        pendingChats: [...pendingChats, ...chats.slice(index)],
      }
    }
  }
  return {
    chats: chats.length,
    chunks,
    left,
    ...(pendingChats.length ? { pendingChats } : {}),
    ...(embed ? {} : { notEmbedded: "embedding is off", pendingChats: chats }),
  }
}

const PENDING = "embed_pending"

/**
 * Embeds what changed since the last run, and whatever an earlier run left. The folders waiting are kept in
 * the store's sync state, so a run stopped by its bound, or a missing model, picks up next time; the first run
 * after embedding exists takes every folder already stored.
 */
export const embedChanged = async (
  store: MessageStore,
  key: AccountKey,
  changed: string[],
  options: { maxChunks?: number; maxChats?: number; embed?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<NotesEmbedded> => {
  const saved = await store.syncState(key, PENDING)
  const waiting =
    saved === undefined
      ? (await store.chats(key, { limit: 10_000 })).items.map(({ id }) => id)
      : JSON.parse(saved.value)
  // A build under older rules, or one a change made stale, is rebuilt even when no note changed since.
  const deps = storeOnlyDeps(store, key, { app: APP, ...(options.env === undefined ? {} : { env: options.env }) })
  const behind = (await embeddingsService(deps).readiness({})).chats
    .filter(({ state, graph, vectors }) => state === "stale" || graph?.outdatedRules === true || vectors.missing > 0)
    .map(({ chat }) => chat)
  const chats = [...new Set<string>([...changed, ...waiting, ...behind])]
  if (chats.length === 0) return { chats: 0, chunks: 0, left: false }
  const selected = chats.slice(0, options.maxChats ?? 100)
  const result = await embedNotes(store, key, selected, options)
  const pending = [...chats.slice(selected.length), ...(result.pendingChats ?? (result.left ? selected : []))]
  result.left ||= pending.length > 0
  // Embedding off leaves every chat waiting, so turning it on later embeds them.
  await store.setSyncState(key, PENDING, JSON.stringify(pending))
  return result
}

export interface NoteChunksEmbedded {
  chunks: number
  /** Chunks left for the next run, when the run's bound stopped it. */
  left: boolean
  /** Why nothing was embedded, when nothing could be. */
  notEmbedded?: string
}

/**
 * Embeds the notes' chunks that have no vector yet, for search by meaning. Bounded like mail, so a
 * timer run stays short and the next continues. A missing model is reported, never downloaded.
 */
export const embedNoteChunks = async (
  store: MessageStore,
  {
    maxChunks = EMBED_PER_RUN,
    embed = true,
    env,
  }: { maxChunks?: number; embed?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<NoteChunksEmbedded> => {
  if (!embed) return { chunks: 0, left: true, notEmbedded: "embedding is off" }
  try {
    const done = await embedNoteChunksOf(store, { maxChunks, command: "tg", ...(env === undefined ? {} : { env }) })
    return { chunks: done.embedded, left: done.left }
  } catch (error) {
    if (!isMissingModel(error)) throw error
    return {
      chunks: 0,
      left: true,
      notEmbedded: "the e5-small model is not downloaded — tg models text download e5-small",
    }
  }
}
