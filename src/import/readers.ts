import { isCliError } from "@wirecat/cli-base"
import { readFile, SOURCE_TEXT_CHARS } from "../sources/read.js"
import { type FoundFile, type ReadDocument, readTextFile, sha256Of, TEXT_EXTENSIONS, titleOfName } from "./files.js"

export const RECORDS_FILES = new Set([".json", ".jsonl"])

/** Read by `sources add`'s own readers; an image is never among them, so nothing is sent to a model. */
const DOCUMENT_EXTENSIONS: Readonly<Record<string, string>> = { ".pdf": "pdf", ".docx": "docx" }

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

/** The reader of a file found in a folder, or why it is skipped. */
export const readerOf = (file: FoundFile): Reader | string => {
  if (TEXT_EXTENSIONS[file.extension]) return readTextFile
  if (DOCUMENT_EXTENSIONS[file.extension]) return readDocument
  if (RECORDS_FILES.has(file.extension)) return "a records file is imported on its own: memo import <file> --account …"
  return `no reader for ${file.extension || "a file without an extension"}`
}
