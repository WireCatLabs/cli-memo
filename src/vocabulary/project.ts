import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-messaging/store"

export const canonicalProject = async (store: MessageStore, reference: string): Promise<string> => {
  if (/^project:[1-9]\d*$/.test(reference)) {
    const catalog = await store.knowledge.vocabulary({ kind: "project" })
    if (!catalog.entries.some((entry) => entry.id === reference.slice(8)))
      throw new CliError("not_found", "the owner project is unavailable")
    return reference
  }
  const found = await store.knowledge.resolveVocabulary(reference, { kind: "project" })
  if (found.matches.length !== 1)
    throw new CliError(
      found.matches.length ? "validation_error" : "not_found",
      "choose one canonical project reference from vocabulary resolve",
      { candidates: found.matches.map((entry) => ({ id: entry.id, key: entry.key, name: entry.name })) },
    )
  const entry = found.matches[0]
  if (!entry) throw new CliError("not_found", "the owner project is unavailable")
  return `project:${entry.id}`
}
