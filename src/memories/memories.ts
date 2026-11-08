import type { Author, EvidenceInput, Memory, MessageStore } from "@wirecat/cli-core/store"
import { canonicalProject } from "../vocabulary/project.js"

export interface NewMemory {
  text: string
  kind: Memory["kind"]
  scope: Memory["scope"]
  evidence: EvidenceInput[]
  subject?: string
  project?: string
  supersedes?: string
}

/**
 * The owner stands behind what they write; an agent's memory waits as `proposed` until the owner confirms it. An
 * agent's correction waits too: the memory it corrects stays as it is until the owner confirms the correction.
 */
export const addMemory = async (store: MessageStore, memory: NewMemory, by: Author): Promise<Memory> =>
  store.memories.add({
    kind: memory.kind,
    body: memory.text,
    scope: memory.scope,
    evidence: memory.evidence,
    author: by,
    status: by === "owner" ? "confirmed" : "proposed",
    ...(memory.subject === undefined ? {} : { subject: memory.subject }),
    ...(memory.project === undefined ? {} : { project: await canonicalProject(store, memory.project) }),
    ...(memory.supersedes === undefined ? {} : { supersedes: memory.supersedes }),
  })
