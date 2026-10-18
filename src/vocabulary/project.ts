import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"

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
      found.matches.length
        ? `${reference} names ${found.matches.length} projects; give one by its key, as memo vocabulary show ${reference} lists them`
        : `no project ${reference}; memo projects list shows yours, memo projects add creates one`,
      { candidates: found.matches.map((entry) => ({ id: entry.id, key: entry.key, name: entry.name })) },
    )
  const entry = found.matches[0]
  if (!entry) throw new CliError("not_found", "the owner project is unavailable")
  return `project:${entry.id}`
}
