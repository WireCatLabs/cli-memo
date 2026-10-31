import { CliError } from "@wirecat/cli-base"
import type { Author, Memory, MessageStore } from "@wirecat/cli-core/store"

export interface NewMemory {
  text: string
  kind: Memory["kind"]
  scope: Memory["scope"]
  evidence: string[]
  subject?: string
  supersedes?: string
}

/** The owner stands behind what they write; an agent's memory waits as `proposed` until the owner confirms it. */
export const addMemory = (store: MessageStore, memory: NewMemory, by: Author): Promise<Memory> => {
  // The store supersedes at once, so an agent's proposal would push out a memory the owner confirmed.
  if (memory.supersedes !== undefined && by !== "owner")
    throw new CliError("permission_error", "only the owner corrects a memory; an agent adds a new one", {
      param: "supersedes",
    })
  return store.memories.add({
    kind: memory.kind,
    body: memory.text,
    scope: memory.scope,
    evidence: memory.evidence,
    author: by,
    status: by === "owner" ? "confirmed" : "proposed",
    ...(memory.subject === undefined ? {} : { subject: memory.subject }),
    ...(memory.supersedes === undefined ? {} : { supersedes: memory.supersedes }),
  })
}
