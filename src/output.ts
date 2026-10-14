import { resolveOutput } from "@wirecat/cli-core"

// Their keys are the owner's or a provider's words, not memo's: a note's front matter, an email's headers.
const VERBATIM = new Set(["frontMatter", "front_matter", "metadata", "headers"])

const IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/

const snakeKey = (key: string): string =>
  IDENTIFIER.test(key) ? key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase() : key

/**
 * memo's answers in the standard's spelling: every key snake_case, whatever the record it came from. Goes when
 * memo adopts the cli-core whose `snakeKeys` keeps named keys as written.
 */
export const snakeKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(snakeKeys)
  if (value === null || typeof value !== "object" || value instanceof Date) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [snakeKey(key), VERBATIM.has(key) ? item : snakeKeys(item)]),
  )
}

/**
 * Found messages cut to cli-core's detail level, which picks a hit's fields by their camelCase names — so before
 * `snakeKeys`. cli-core exports the cut only inside its JSON renderer.
 */
export const atDetail = <T>(value: T, level?: "brief" | "default" | "full"): T => {
  let picked = ""
  resolveOutput({
    json: true,
    streams: { data: (chunk: string) => (picked += chunk), diagnostic: () => undefined, progress: () => undefined },
    ...(level === undefined ? {} : { hitDetail: level }),
  }).renderer.result(value)
  return JSON.parse(picked) as T
}
