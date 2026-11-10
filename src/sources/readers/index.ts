import { aiModel } from "./ai-model.js"
import { anthropicReader, openaiReader } from "./api.js"
import { claudeCode } from "./claude-code.js"
import { codex } from "./codex.js"
import { ollama } from "./ollama.js"
import type { Reader } from "./types.js"

export type { Reader, ReaderContext, ReaderProbe } from "./types.js"
export { leavesComputer } from "./types.js"

export const READERS: readonly Reader[] = [aiModel, claudeCode, codex, ollama, openaiReader, anthropicReader]

export const READER_IDS = READERS.map((reader) => reader.id)

export const readerOf = (id: string): Reader | undefined => READERS.find((reader) => reader.id === id)
