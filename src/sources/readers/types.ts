import type { KeyringStore } from "@wirecat/cli-base"
import type { FetchLike } from "@wirecat/cli-base/http"

/** What a reader needs from the run: its environment, and the network and keyring a test replaces. */
export interface ReaderContext {
  env: NodeJS.ProcessEnv
  fetch: FetchLike
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
  /** The text goes to a service outside this computer; for the shared AI model it depends on the owner's setting. */
  leavesComputer: boolean | ((env: NodeJS.ProcessEnv) => boolean)
  /** The reader is an agent that could open files of this computer, though memo asks it not to. */
  readsFiles: boolean
  /** It refuses to read until the owner names a model. */
  needsModel: boolean
  /** The model it reads with, set elsewhere than `--model`; such a reader refuses `--model`. */
  modelOf?: (env: NodeJS.ProcessEnv) => string | null
  probe(context: ReaderContext): Promise<ReaderProbe>
  /** The model's answer as text. */
  read(context: ReaderContext, request: ReadRequest): Promise<string>
}

export const leavesComputer = (reader: Reader, env: NodeJS.ProcessEnv): boolean =>
  typeof reader.leavesComputer === "function" ? reader.leavesComputer(env) : reader.leavesComputer
