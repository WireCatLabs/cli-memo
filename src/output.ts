import { randomUUID } from "node:crypto"
import { createRenderer, type Streams } from "@wirecat/cli-base"
import type { Meta } from "@wirecat/cli-base/standards"
import { resolveOutput } from "@wirecat/cli-core"

// Their keys are the owner's or a provider's words, not memo's: a note's front matter, an email's headers.
const VERBATIM = new Set(["frontMatter", "front_matter", "metadata", "headers"])

const IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/

const snakeKey = (key: string): string =>
  IDENTIFIER.test(key) ? key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase() : key

/** memo's answers in the standard's spelling: every key snake_case, whatever the record it came from. */
export const snakeKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(snakeKeys)
  if (value === null || typeof value !== "object" || value instanceof Date) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [snakeKey(key), VERBATIM.has(key) ? item : snakeKeys(item)]),
  )
}

/** One run's `meta`: memo keeps no run log yet, so the id names this answer only. */
export const metaOf = (
  startedAt: number,
  extra: Omit<Meta, "run_id" | "duration_ms" | "complete"> & Partial<Pick<Meta, "complete">> = {},
): Meta => ({
  run_id: randomUUID(),
  duration_ms: Math.max(0, Math.round(Date.now() - startedAt)),
  complete: true,
  ...extra,
})

const atLevel = (streams: Streams, value: unknown, level?: "brief" | "default" | "full"): unknown => {
  let picked = ""
  resolveOutput({
    json: true,
    streams: { ...streams, data: (chunk: string) => (picked += chunk) },
    ...(level === undefined ? {} : { hitDetail: level }),
  }).renderer.result(value)
  return JSON.parse(picked)
}

/** Prints JSON at cli-core's detail level, which picks a hit's fields by their camelCase names, then snake_case. */
export const printAtDetail = (streams: Streams, value: unknown, level?: "brief" | "default" | "full"): void => {
  const body =
    isRecord(value) && "item" in value
      ? { ...value, item: atLevel(streams, value.item, level) }
      : atLevel(streams, value, level)
  createRenderer({ format: "json", color: false, streams }).result(snakeKeys(body))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)

const PAGE_KEYS = new Set(["items", "hasMore", "has_more"])

/**
 * Any answer in the standard's envelope. An array, or a page of only `items` and `hasMore`, is a list; anything
 * else is one item, so a list that carries more than its page keeps all of it.
 */
export const envelopeOf = (value: unknown, startedAt: number, extra: Parameters<typeof metaOf>[1] = {}): object => {
  const meta = metaOf(startedAt, extra)
  const rows = Array.isArray(value)
    ? { items: value }
    : isRecord(value) && Array.isArray(value.items) && Object.keys(value).every((key) => PAGE_KEYS.has(key))
      ? value
      : undefined
  if (rows === undefined) return { item: value, meta }
  const items = rows.items as unknown[]
  return {
    items,
    page: { mode: "page", limit: Math.max(1, items.length), has_more: rows.hasMore === true || rows.has_more === true },
    meta,
  }
}

/** {@link envelopeOf} with every key snake_case. */
export const answerOf = (value: unknown, startedAt: number, extra: Parameters<typeof metaOf>[1] = {}): unknown =>
  snakeKeys(envelopeOf(value, startedAt, extra))

/** When this process started: a command that prints through a shared printer times its answer from here. */
export const processStart = (): number => performance.timeOrigin
