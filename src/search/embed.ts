import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { isCliError, type KeyringStore } from "@wirecat/cli-base"
import { chosenTextModel, embedMail as embedMailChunksOf, textModels } from "@wirecat/cli-core/services"
import { sharedModelsDirectory } from "@wirecat/cli-core/speech"
import type { MessageStore } from "@wirecat/cli-core/store"
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

/** The model the error names, and the exact command that downloads it. */
const missingModel = (error: unknown, env: NodeJS.ProcessEnv | undefined): string => {
  const named = isCliError(error) ? error.details.model : undefined
  const id = typeof named === "string" ? named : chosenTextModel(env).id
  return `the ${id} model is not downloaded — wcat models download ${id}`
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

type Enriched = Awaited<ReturnType<typeof embedMailChunksOf>>["enrichment"]

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
 * One sync's enrichment parts (files sync's notes, wcat's mail) as one block: sums, and the reason of the worse part. It is `failed` only when
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

/** Embeds mail's chunks that have no vector yet, bounded so a timer run stays short; a missing model is reported, never downloaded. */
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
    // wcat's identity lets enrichment read the key wcat's keyring entry holds.
    const done = await embedMailChunksOf(store, {
      maxChunks,
      command: APP.command,
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
