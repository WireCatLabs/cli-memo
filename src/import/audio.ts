import { CliError, isCliError } from "@wirecat/cli-base"
import {
  DEFAULT_ORDER,
  decodeAudio,
  installedBytes,
  isInstalled,
  megabytes,
  modelsDirectory,
  recognizeLocalPieces,
  runFfmpeg,
  speechModel,
  type TimedText,
} from "@wirecat/cli-core/speech"
import type { MessageStore } from "@wirecat/cli-core/store"
import { idOfPath } from "./external-id.js"
import { type FoundFile, type ReadDocument, readBytes, sha256Of, titleOfName, unreadable } from "./files.js"

export const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".ogg", ".oga", ".opus", ".flac", ".aac", ".webm"])

/** An hour of WAV at 16 kHz is about 115 MB; cli-core's decoder stops at an hour anyway. */
const AUDIO_BYTES = 256 * 1024 * 1024

export interface Heard {
  pieces: TimedText[]
  /** The local model that heard it. */
  model: string
  seconds: number
}

/** How a recording becomes text; a test hands in its own, so no model is ever run there. */
export type Hear = (bytes: Uint8Array, env: NodeJS.ProcessEnv) => Promise<Heard>

/** Parakeet first: it hears 25 languages. */
const MODEL = DEFAULT_ORDER[0] ?? "parakeet-v3"

/** The model on this computer, never a service: a model that is not downloaded is refused, never fetched. */
export const hearLocally: Hear = async (bytes, env) => {
  const model = speechModel(MODEL)
  const directory = modelsDirectory(env)
  if (!isInstalled(model, directory))
    throw new CliError(
      "not_found",
      `the speech model ${MODEL} is not on this computer; a WireCat CLI that transcribes downloads it once, such as ` +
        `\`tg models download ${MODEL}\` (${megabytes(installedBytes(model))})`,
      { reason: "model.not-downloaded", model: MODEL },
    )
  const pcm = await decodeAudio(bytes, runFfmpeg)
  const pieces = await recognizeLocalPieces(MODEL, pcm, { env, directory })
  return { pieces, model: MODEL, seconds: pcm.samples.length / pcm.rate }
}

const stampOf = (seconds: number) => {
  const whole = Math.floor(seconds)
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  const two = (n: number) => String(n).padStart(2, "0")
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

/** One line per piece the voice detector cut, with where it starts, so a passage found in search can be played. */
export const timedText = (pieces: readonly TimedText[]) =>
  pieces
    .filter((piece) => piece.text.trim())
    .map((piece) => `[${stampOf(piece.start)}] ${piece.text.trim()}`)
    .join("\n")

/** What a recording became, or why it was not heard. */
export type Hearing = ReadDocument | { refused: string }

/**
 * Hears every recording before the import writes anything: a dry run holds the store for its length, and a model
 * that is missing stops the import before any record is written. A recording whose bytes match the hash its
 * document keeps is not heard again; its stored text is sent unchanged.
 */
export const hearAll = async (
  store: Pick<MessageStore, "records">,
  files: readonly FoundFile[],
  {
    provider,
    account,
    type,
    transcribe,
    dryRun,
    hear,
    env,
  }: {
    provider: string
    account: string
    type: string
    transcribe: boolean
    dryRun: boolean
    hear: Hear
    env: NodeJS.ProcessEnv
  },
): Promise<Map<string, Hearing>> => {
  const heard = new Map<string, Hearing>()
  for (const file of files) {
    if (!AUDIO_EXTENSIONS.has(file.extension)) continue
    if (!transcribe) {
      heard.set(file.path, { refused: "a recording: add --transcribe to hear it on this computer" })
      continue
    }
    if (file.stat.size > AUDIO_BYTES) {
      heard.set(file.path, { refused: `larger than ${AUDIO_BYTES / 1024 / 1024} MiB` })
      continue
    }
    const bytes = await readBytes(file.path, file.stat.size).catch((error: unknown) => unreadable(error))
    if (typeof bytes === "string") {
      heard.set(file.path, { refused: bytes })
      continue
    }
    const sha256 = sha256Of(bytes)
    const stored = await store.records.get({ provider, account, type, externalId: idOfPath(file.relative) })
    const fields = stored?.deletedAt === null ? (stored.fields as Partial<ReadDocument>) : undefined
    const kept = (fields?.metadata as { sha256?: unknown } | undefined)?.sha256
    if (fields && kept === sha256 && typeof fields.text === "string" && typeof fields.title === "string") {
      heard.set(file.path, { title: fields.title, text: fields.text, metadata: fields.metadata ?? {} })
      continue
    }
    if (dryRun) {
      heard.set(file.path, { refused: "a dry run does not transcribe; the import hears it" })
      continue
    }
    let result: Heard
    try {
      result = await hear(bytes, env)
    } catch (error) {
      // A missing model stops the whole import; one bad recording is only that recording's problem.
      if (isCliError(error) && error.details.reason === "model.not-downloaded") throw error
      heard.set(file.path, { refused: `could not be heard: ${error instanceof Error ? error.message : String(error)}` })
      continue
    }
    const { pieces, model, seconds } = result
    const text = timedText(pieces)
    if (!text) {
      heard.set(file.path, { refused: "no speech was heard in it" })
      continue
    }
    heard.set(file.path, {
      title: titleOfName(file.relative),
      text,
      metadata: {
        format: "audio",
        sha256,
        audio: { seconds: Math.round(seconds * 10) / 10, model, pieces: pieces.length },
      },
    })
  }
  return heard
}
