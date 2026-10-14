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
export const metaOf = (startedAt: number, extra: Omit<Meta, "run_id" | "duration_ms"> = {}): Meta => ({
  run_id: randomUUID(),
  duration_ms: Math.max(0, Math.round(Date.now() - startedAt)),
  ...extra,
})

/** Prints JSON at cli-core's detail level, which picks a hit's fields by their camelCase names, then snake_case. */
export const printAtDetail = (streams: Streams, value: unknown, level?: "brief" | "default" | "full"): void => {
  let picked = ""
  resolveOutput({
    json: true,
    streams: { ...streams, data: (chunk: string) => (picked += chunk) },
    ...(level === undefined ? {} : { hitDetail: level }),
  }).renderer.result(value)
  createRenderer({ format: "json", color: false, streams }).result(snakeKeys(JSON.parse(picked)))
}
