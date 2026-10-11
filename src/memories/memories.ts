import type { Author, Memory, MessageStore } from "@wirecat/cli-messaging/store"

export interface NewMemory {
  text: string
  kind: Memory["kind"]
  scope: Memory["scope"]
  evidence: string[]
  subject?: string
}

/** The owner stands behind what they write; an agent's memory waits as `proposed` until the owner confirms it. */
export const addMemory = (store: MessageStore, memory: NewMemory, by: Author): Promise<Memory> =>
  store.memories.add({
    kind: memory.kind,
    body: memory.text,
    scope: memory.scope,
    evidence: memory.evidence,
    author: by,
    status: by === "owner" ? "confirmed" : "proposed",
    ...(memory.subject === undefined ? {} : { subject: memory.subject }),
  })
