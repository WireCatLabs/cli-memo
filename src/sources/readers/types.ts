import type { KeyringStore } from "@wirecat/cli-base"

/** What a reader needs from the run: its environment, and the network and keyring a test replaces. */
export interface ReaderContext {
  env: NodeJS.ProcessEnv
  fetch: typeof fetch
  keyring?: KeyringStore
  signal?: AbortSignal
}

export interface ReaderProbe {
  available: boolean
  signedIn: boolean | null
  version: string | null
  /** The models a local reader has; `null` where the reader does not say. */
  models: string[] | null
  /** Why it cannot read now, with the fix; `null` when it can. */
  problem: string | null
}

export interface ReadRequest {
  system: string
  prompt: string
  model: string | null
}

/** One way to have a model read a source. A new reader is one file that exports one of these. */
export interface Reader {
  id: string
  title: string
  provider: string
  /** The text goes to a service outside this computer. */
  leavesComputer: boolean
  /** The reader is an agent that could open files of this computer, though memo asks it not to. */
  readsFiles: boolean
  /** It refuses to read until the owner names a model. */
  needsModel: boolean
  probe(context: ReaderContext): Promise<ReaderProbe>
  /** The model's answer as text. */
  read(context: ReaderContext, request: ReadRequest): Promise<string>
}
