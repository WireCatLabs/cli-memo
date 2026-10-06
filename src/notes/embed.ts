import { CliError } from "@leemour/cli-core"
import { conversationsService, embeddingsService, storeOnlyDeps } from "@leemour/cli-messaging/services"
import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"
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
  for (const chat of embed ? chats : []) {
    if (chunks >= maxChunks) {
      left = true
      break
    }
    try {
      const done = await embeddings.embed(chat, { maxChunks: maxChunks - chunks })
      chunks += done.embedded
      if ((await embeddings.status(chat)).left > 0) left = true
    } catch (error) {
      if (!isMissingModel(error)) throw error
      return {
        chats: chats.length,
        chunks,
        left: true,
        notEmbedded: "the e5-small model is not downloaded — tg models text download e5-small",
      }
    }
  }
  return { chats: chats.length, chunks, left, ...(embed ? {} : { notEmbedded: "embedding is off" }) }
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
  options: { maxChunks?: number; embed?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<NotesEmbedded> => {
  const saved = await store.syncState(key, PENDING)
  const waiting =
    saved === undefined
      ? (await store.chats(key, { limit: 10_000 })).items.map(({ id }) => id)
      : JSON.parse(saved.value)
  const chats = [...new Set<string>([...waiting, ...changed])].sort()
  if (chats.length === 0) return { chats: 0, chunks: 0, left: false }
  const result = await embedNotes(store, key, chats, options)
  // Embedding off leaves every chat waiting, so turning it on later embeds them.
  await store.setSyncState(key, PENDING, JSON.stringify(result.left || options.embed === false ? chats : []))
  return result
}
