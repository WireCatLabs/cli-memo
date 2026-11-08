import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { isCliError, type KeyringStore } from "@wirecat/cli-base"
import {
  chosenTextModel,
  conversationsService,
  embeddingsService,
  embedMail as embedMailChunksOf,
  embedNotes as embedNoteChunksOf,
  storeOnlyDeps,
  textModels,
} from "@wirecat/cli-core/services"
import { sharedModelsDirectory } from "@wirecat/cli-core/speech"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { APP } from "../app.js"

/** About three chunks a second with e5-small on this laptop (2026-10-06): a run stays near three minutes, under a five-minute timer, and the next resumes. */
export const EMBED_PER_RUN = 600

/** The model EMBED_PER_RUN was measured with; no longer the default, so it is named here. */
const MEASURED_WITH = "e5-small"

/** A model of unknown speed is taken to be as slow as EmbeddingGemma, so a timer run still ends in time. */
const SLOWEST_KNOWN = 2

/** The run's bound for the chosen model: a slower model embeds fewer chunks in the same three minutes. */
export const embedPerRun = (env: NodeJS.ProcessEnv = process.env): number => {
  const models = textModels(env)
  const speed = (id: string) => models.find((model) => model.id === id)?.chunksPerSecond ?? SLOWEST_KNOWN
  const ratio = speed(chosenTextModel(env).id) / speed(MEASURED_WITH)
  return Math.max(8, Math.min(EMBED_PER_RUN, Math.round(EMBED_PER_RUN * ratio)))
}

export interface NotesEmbedded {
  chats: number
  chunks: number
  /** Chunks left for the next run, when the run's bound stopped it. */
  left: boolean
  /** Why nothing was embedded, when nothing could be. */
  notEmbedded?: string
  pendingChats?: string[]
}

/** The model the error names, and the exact command that downloads it. */
const missingModel = (error: unknown, env: NodeJS.ProcessEnv | undefined): string => {
  const named = isCliError(error) ? error.details.model : undefined
  const id = typeof named === "string" ? named : chosenTextModel(env).id
  return `the ${id} model is not downloaded — memo models download ${id}`
}

/** Whether the chosen text model is downloaded; an unreadable model choice counts as missing, and doctor names it. */
export const searchModelPresent = (env: NodeJS.ProcessEnv): boolean => {
  try {
    const path = join(sharedModelsDirectory("text", env), chosenTextModel(env).id)
    return existsSync(path) && readdirSync(path).length > 0
  } catch {
    return false
  }
}

const isMissingModel = (error: unknown): boolean => isCliError(error) && error.details.reason === "model.not-downloaded"

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
    embed = true,
    env,
    maxChunks = embedPerRun(env),
  }: { maxChunks?: number; embed?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<NotesEmbedded> => {
  const deps = storeOnlyDeps(store, key, { app: APP, ...(env === undefined ? {} : { env }) })
  const conversations = conversationsService(deps)
  const embeddings = embeddingsService(deps)
  for (const chat of chats) {
    await conversations.build(chat).catch((error: unknown) => {
      // A folder whose every note was deleted has nothing left to build.
      if (!(isCliError(error) && error.code === "not_found")) throw error
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
        notEmbedded: missingModel(error, env),
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
  const saved = await store.sync.syncState(key, PENDING)
  const waiting =
    saved === undefined
      ? (await store.chats.chats(key, { limit: 10_000 })).items.map(({ id }) => id)
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
  await store.sync.setSyncState(key, PENDING, JSON.stringify(pending))
  return result
}

/** What the owner's enrichment sent before the chunks were embedded; absent when enrichment is off. */
export interface EnrichmentReport {
  status: "done" | "stopped" | "failed"
  provider?: string
  model?: string
  /** Records sent to the provider this run; `enriched` came back, `failed` stay for the next sync. */
  sent: number
  enriched: number
  failed: number
  /** Records still without an enrichment of their current text. */
  left: number
  inputTokens: number
  outputTokens: number
  /** `null` when the model has no known price. */
  costUsd: number | null
  reason?: string
  /** `reason` as an id from cli-core's ENRICHMENT_REASON_IDS, for a window to word it. */
  reasonId?: string
}

export interface NoteChunksEmbedded {
  chunks: number
  /** Chunks left for the next run, when the run's bound stopped it. */
  left: boolean
  /** Why nothing was embedded, when nothing could be. */
  notEmbedded?: string
  enrichment?: EnrichmentReport
}

type Enriched = Awaited<ReturnType<typeof embedNoteChunksOf>>["enrichment"]

const reportOf = (run: Enriched): EnrichmentReport | undefined => {
  if (run === undefined) return undefined
  if (!("provider" in run))
    return {
      status: "failed",
      sent: 0,
      enriched: 0,
      failed: 0,
      left: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      reason: run.reason,
      reasonId: run.reason_id,
    }
  return {
    status: run.status,
    provider: run.provider,
    model: run.model,
    sent: run.enriched + run.failed,
    enriched: run.enriched,
    failed: run.failed,
    left: run.left,
    inputTokens: run.usage.input,
    outputTokens: run.usage.output,
    costUsd: run.cost_usd,
    ...(run.reason === undefined ? {} : { reason: run.reason }),
    ...(run.reason_id === undefined ? {} : { reasonId: run.reason_id }),
  }
}

/**
 * One sync's notes and mail enrichment as one block: sums, and the reason of the worse part. It is `failed` only when
 * nothing came back enriched, so mail enriched beside failed notes still reads `stopped`.
 */
export const combinedEnrichment = (...parts: (EnrichmentReport | undefined)[]): EnrichmentReport | undefined => {
  const present = parts.filter((part): part is EnrichmentReport => part !== undefined)
  if (present.length === 0) return undefined
  const rank = { done: 0, stopped: 1, failed: 2 } as const
  const worst = present.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a))
  const enriched = present.reduce((sum, part) => sum + part.enriched, 0)
  const status = worst.status === "failed" && enriched > 0 ? "stopped" : worst.status
  const named = present.find((part) => part.provider !== undefined)
  const costs = present.map((part) => part.costUsd)
  return {
    status,
    ...(named?.provider === undefined ? {} : { provider: named.provider }),
    ...(named?.model === undefined ? {} : { model: named.model }),
    sent: present.reduce((sum, part) => sum + part.sent, 0),
    enriched,
    failed: present.reduce((sum, part) => sum + part.failed, 0),
    left: present.reduce((sum, part) => sum + part.left, 0),
    inputTokens: present.reduce((sum, part) => sum + part.inputTokens, 0),
    outputTokens: present.reduce((sum, part) => sum + part.outputTokens, 0),
    costUsd: costs.includes(null)
      ? null
      : Math.round(costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0) * 1_000_000) / 1_000_000,
    ...(worst.reason === undefined ? {} : { reason: worst.reason }),
    ...(worst.reasonId === undefined ? {} : { reasonId: worst.reasonId }),
  }
}

/**
 * Embeds the notes' chunks that have no vector yet, for search by meaning. Bounded like mail, so a
 * timer run stays short and the next continues. A missing model is reported, never downloaded.
 */
export const embedNoteChunks = async (
  store: MessageStore,
  {
    embed = true,
    env,
    maxChunks = embedPerRun(env),
    keyring,
  }: { maxChunks?: number; embed?: boolean; env?: NodeJS.ProcessEnv; keyring?: KeyringStore } = {},
): Promise<NoteChunksEmbedded> => {
  if (!embed) return { chunks: 0, left: true, notEmbedded: "embedding is off" }
  try {
    // memo's identity lets enrichment read the key memo's keyring entry holds.
    const done = await embedNoteChunksOf(store, {
      maxChunks,
      command: "memo",
      app: APP,
      ...(env === undefined ? {} : { env }),
      ...(keyring ? { keyring } : {}),
    })
    const enrichment = reportOf(done.enrichment)
    return { chunks: done.embedded, left: done.left, ...(enrichment ? { enrichment } : {}) }
  } catch (error) {
    if (!isMissingModel(error)) throw error
    const enrichment = isCliError(error) ? reportOf(error.details.enrichment as Enriched) : undefined
    return {
      chunks: 0,
      left: true,
      notEmbedded: missingModel(error, env),
      ...(enrichment ? { enrichment } : {}),
    }
  }
}

/** Embeds mail's chunks that have no vector yet, bounded as notes are; a missing model is reported, never downloaded. */
export const embedMailChunks = async (
  store: MessageStore,
  {
    embed = true,
    env,
    maxChunks = embedPerRun(env),
    keyring,
  }: { maxChunks?: number; embed?: boolean; env?: NodeJS.ProcessEnv; keyring?: KeyringStore } = {},
): Promise<NoteChunksEmbedded> => {
  if (!embed) return { chunks: 0, left: true, notEmbedded: "embedding is off" }
  try {
    // memo's identity lets enrichment read the key memo's keyring entry holds.
    const done = await embedMailChunksOf(store, {
      maxChunks,
      command: "memo",
      app: APP,
      ...(env === undefined ? {} : { env }),
      ...(keyring ? { keyring } : {}),
    })
    const enrichment = reportOf(done.enrichment)
    return { chunks: done.embedded, left: done.left, ...(enrichment ? { enrichment } : {}) }
  } catch (error) {
    if (!isMissingModel(error)) throw error
    const enrichment = isCliError(error) ? reportOf(error.details.enrichment as Enriched) : undefined
    return {
      chunks: 0,
      left: true,
      notEmbedded: missingModel(error, env),
      ...(enrichment ? { enrichment } : {}),
    }
  }
}
