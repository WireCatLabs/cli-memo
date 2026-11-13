import { isCliError } from "@wirecat/cli-base"
import { readFile, SOURCE_TEXT_CHARS } from "../sources/read.js"
import {
  type FoundFile,
  type ReadDocument,
  readBytes,
  readTextFile,
  sha256Of,
  TEXT_EXTENSIONS,
  titleOfName,
} from "./files.js"

export const RECORDS_FILES = new Set([".json", ".jsonl"])

/** Read by `sources add`'s own readers; an image is never among them, so nothing is sent to a model. */
const DOCUMENT_EXTENSIONS: Readonly<Record<string, string>> = { ".pdf": "pdf", ".docx": "docx" }

const TRANSCRIPT_EXTENSIONS: Readonly<Record<string, string>> = { ".vtt": "vtt", ".srt": "srt" }

export type Refused = { refused: string }

export type Reader = (file: FoundFile) => Promise<ReadDocument | Refused>

/** A PDF or Word file through memo's document readers, which run on this computer. */
const readDocument: Reader = async (file) => {
  try {
    const read = await readFile(file.path, { maxChars: SOURCE_TEXT_CHARS })
    if (read.read !== "extracted" || !read.text.trim())
      return { refused: "holds no text memo can read, such as a scanned PDF" }
    return {
      title: read.title ?? titleOfName(file.relative),
      text: read.text.trim(),
      metadata: {
        format: DOCUMENT_EXTENSIONS[file.extension],
        sha256: sha256Of(read.bytes ?? new Uint8Array()),
        extractor: read.extractor,
      },
    }
  } catch (error) {
    return { refused: isCliError(error) ? error.message : "its reader could not read it" }
  }
}

const CUE = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/

const secondsOf = (stamp: string) =>
  stamp
    .replace(",", ".")
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0)

/** Where the talk starts and ends, in seconds, and who speaks: what `transcriptText` leaves out of the text. */
export const transcriptTimings = (raw: string, text: string) => {
  let cues = 0
  let start: number | undefined
  let end = 0
  for (const line of raw.split(/\r?\n/)) {
    const cue = CUE.exec(line)
    if (!cue?.[1] || !cue[2]) continue
    cues++
    start ??= secondsOf(cue[1])
    end = Math.max(end, secondsOf(cue[2]))
  }
  const speakers = [...new Set(text.split("\n").flatMap((line) => /^([^:\n]{1,60}):\s/.exec(line)?.[1] ?? []))]
  return { cues, start_seconds: start ?? 0, end_seconds: end, speakers: speakers.slice(0, 50) }
}

/** A WebVTT or SubRip file as `sources add` keeps it, one `Name: text` line per turn, with its timings beside it. */
const readTranscript: Reader = async (file) => {
  const read = await readDocument(file)
  if ("refused" in read) return read
  const raw = new TextDecoder().decode(await readBytes(file.path, file.stat.size))
  return {
    ...read,
    title: titleOfName(file.relative),
    metadata: {
      ...read.metadata,
      format: TRANSCRIPT_EXTENSIONS[file.extension],
      transcript: transcriptTimings(raw, read.text),
    },
  }
}

/** The reader of a file found in a folder, or why it is skipped. */
export const readerOf = (file: FoundFile): Reader | string => {
  if (TEXT_EXTENSIONS[file.extension]) return readTextFile
  if (DOCUMENT_EXTENSIONS[file.extension]) return readDocument
  if (TRANSCRIPT_EXTENSIONS[file.extension]) return readTranscript
  if (RECORDS_FILES.has(file.extension)) return "a records file is imported on its own: memo import <file> --account …"
  return `no reader for ${file.extension || "a file without an extension"}`
}
