import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"

const BARE = /^\d+$/

const either = (words: readonly string[]): string =>
  words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`

/**
 * An argument that takes several kinds refuses a bare number (NEED-2140 A): the same words would change meaning as
 * the store grows. The refusal names only the references that exist, from one read of the store.
 */
export const refuseBareNumber = async (
  store: MessageStore,
  text: string,
  kinds: readonly string[],
  options: { path?: boolean } = {},
): Promise<void> => {
  const value = text.trim()
  if (!BARE.test(value)) return
  const candidates = kinds.map((kind) => `${kind}:${value}`)
  const found = await store.refs.summaries(candidates)
  const existing = candidates.filter((ref) => {
    const state = found.get(ref)?.state
    return state !== undefined && state !== "unavailable"
  })
  const guess = existing.length
    ? `did you mean ${either(existing)}?`
    : `no ${either(kinds.map((kind) => (kind === "msg" ? "message" : kind)))} has id ${value}`
  const path = options.path ? `; to read a file named ${value}, give its path: ./${value}` : ""
  throw new CliError("validation_error", `"${value}" is a bare number; ${guess}${path}`, {
    reason: "ref.bare-number",
    value,
    suggestion: existing[0] ?? candidates[0],
  })
}
