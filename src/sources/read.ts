import { readFileSync, statSync } from "node:fs"
import { basename, extname } from "node:path"
import { CliError, isCliError } from "@wirecat/cli-base"
import {
  type Extraction,
  extractText,
  type FetchPageOptions,
  fetchPage,
  importEngine,
  type LoadEngine,
  MAX_FILE_BYTES,
  type Section,
} from "@wirecat/cli-core/documents"
import type { AddedSourceInput } from "@wirecat/cli-core/store"

/** What memo's folder import keeps of a file's text; `--max-chars` may raise it to the store's own limit. */
export const SOURCE_TEXT_CHARS = 200_000

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i

export const isUrl = (given: string) => URL_LIKE.test(given)

export type SourceArgument = "text" | "url" | "path"

export const argumentKind = (given: string): SourceArgument => (given === "-" ? "text" : isUrl(given) ? "url" : "path")

/** A source as read, before it is stored: what `saveAddedSource` takes, and what the answer reports. */
export interface ReadSource
  extends Pick<AddedSourceInput, "kind" | "text" | "read" | "url" | "fileName" | "mime" | "bytes" | "metadata"> {
  size: number
  extractor: string | null
  truncated: boolean
  title: string | null
  sections?: Section[]
}

const MIMES: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".html": "text/html",
  ".htm": "text/html",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".epub": "application/epub+zip",
  ".rtf": "application/rtf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

const NEXT: Record<string, string> = {
  "source.unsupported": "save it as PDF, Word or plain text and add that file",
  "source.no-text": "nothing was saved; add a file that holds text, or paste the text with memo sources add -",
  "source.unreadable": "open it and save it again, or as PDF or plain text, and add that file",
  "source.engine-missing": "reinstall memo, which brings its readers (npm install -g @wirecat/cli-memo)",
  "source.too-large": "add a smaller part of it, or save only its text and add that",
  "source.url-refused": "give an http or https address of a public page",
  "source.url-status": "check the address in a browser; if it opens only for you, save the page as a file and add it",
  "source.url-timeout": "try again later, or save the page as a file and add it",
  "source.url-redirects": "open the address in a browser and add the address it ends at",
  "source.url-unreachable": "check the address and the connection, or save the page as a file and add it",
  "source.needs-sign-in":
    "add it through your signed-in Google account: drive documents add <url> --profiles <names|all> (or drive <profile> documents add <url>)",
}

/** cli-core's refusal, with the plain next step memo knows for it; its code and reason stay as they were. */
export const withNextStep = (error: unknown): unknown => {
  if (!isCliError(error)) return error
  const reason = error.details.reason
  const step = typeof reason === "string" ? NEXT[reason] : undefined
  return step === undefined ? error : new CliError(error.code, `${error.message} — ${step}`, error.details)
}

const refusal = (extraction: Exclude<Extraction, { status: "extracted" | "needs-agent" }>, name: string) => {
  switch (extraction.status) {
    case "unsupported":
      return new CliError("validation_error", `no reader takes ${name}`, { reason: "source.unsupported" })
    case "unreadable":
      return new CliError("validation_error", `the ${extraction.extractor} reader could not read ${name}`, {
        reason: "source.unreadable",
      })
    case "engine-missing":
      return new CliError("configuration_error", `reading ${name} needs ${extraction.engine}, which is not installed`, {
        reason: "source.engine-missing",
      })
    case "too-large":
      return new CliError("validation_error", `${name} is larger than its reader reads`, { reason: "source.too-large" })
  }
}

const tooLarge = (what: string) =>
  new CliError("validation_error", `${what} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MiB`, {
    reason: "source.too-large",
  })

const noText = (what: string) =>
  new CliError("validation_error", `${what} holds no text to keep`, { reason: "source.no-text" })

/** Line ends as one `\n`, and at most `maxChars`: what the reader found, as the store keeps it. */
const bounded = (text: string, maxChars: number) => {
  const normalized = text.replace(/\r\n?/g, "\n")
  return { text: normalized.slice(0, maxChars), cut: normalized.length > maxChars }
}

const firstLine = (text: string) => {
  const line = text.trimStart().split("\n", 1)[0]?.trim() ?? ""
  return line ? line.slice(0, 120) : null
}

/** A metadata value as one line of text: the first non-empty one when the page gave several. */
const metaText = (metadata: Record<string, string | string[]> | undefined, key: string) => {
  const value = metadata?.[key]
  const first = (Array.isArray(value) ? value : [value]).find((v) => typeof v === "string" && v.trim())
  return first ? first.trim().slice(0, 500) : null
}

const titleIn = (metadata: Record<string, string | string[]> | undefined) => metaText(metadata, "title")

const readStdin = async (stdin: AsyncIterable<string | Uint8Array>): Promise<string> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stdin) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_FILE_BYTES) throw tooLarge("the text on stdin")
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export const readText = async (
  stdin: AsyncIterable<string | Uint8Array>,
  { maxChars }: { maxChars: number },
): Promise<ReadSource> => {
  const raw = await readStdin(stdin)
  const { text, cut } = bounded(raw, maxChars)
  if (!text.trim()) throw noText("the text on stdin")
  return {
    kind: "text",
    text,
    read: "extracted",
    url: null,
    fileName: null,
    mime: "text/plain",
    size: Buffer.byteLength(raw),
    extractor: null,
    truncated: cut,
    title: firstLine(text),
  }
}

export const readFile = async (
  path: string,
  { maxChars, load = importEngine }: { maxChars: number; load?: LoadEngine },
): Promise<ReadSource> => {
  const stat = statSync(path, { throwIfNoEntry: false })
  const name = basename(path)
  if (!stat) throw new CliError("not_found", `no file ${path}`, { path })
  if (!stat.isFile()) throw new CliError("validation_error", `${path} is not a file`, { path })
  if (stat.size > MAX_FILE_BYTES) throw tooLarge(name)
  const bytes = new Uint8Array(readFileSync(path))
  const extension = extname(name).toLowerCase()
  const mime = MIMES[extension] ?? null
  const found = await extractText(bytes, { kind: "file", name, mime, path }, load)
  const base = {
    kind: "file" as const,
    url: null,
    fileName: name,
    mime,
    bytes,
    size: bytes.byteLength,
  }
  if (found.status === "needs-agent")
    return {
      ...base,
      text: "",
      read: "no-text",
      extractor: found.extractor ?? null,
      truncated: false,
      title: name.replace(/\.[^.]+$/, "") || name,
    }
  if (found.status !== "extracted") throw refusal(found, name)
  const { text, cut } = bounded(found.text, maxChars)
  if (!text.trim()) throw noText(name)
  return {
    ...base,
    text,
    read: "extracted",
    extractor: found.extractor,
    truncated: cut || found.truncated === true,
    title: titleIn(found.metadata) ?? (name.replace(/\.[^.]+$/, "") || name),
    ...(found.metadata ? { metadata: found.metadata } : {}),
    ...(found.sections ? { sections: found.sections } : {}),
  }
}

/** The page as read from its address; only the address as given is kept, never where its redirects ended. */
export const readPage = async (
  address: string,
  { maxChars, fetch }: { maxChars: number; fetch?: FetchPageOptions },
): Promise<ReadSource> => {
  const page = await fetchPage(address, fetch)
  const { text, cut } = bounded(page.text, maxChars)
  const mime = page.contentType?.split(";")[0]?.trim().toLowerCase() || null
  return {
    kind: "page",
    text,
    read: page.read,
    url: page.requestedUrl,
    fileName: null,
    mime,
    size: page.bytes,
    extractor: page.extractor,
    truncated: cut || page.truncated,
    title: titleIn(page.metadata) ?? new URL(page.requestedUrl).hostname,
    ...(page.metadata ? { metadata: page.metadata } : {}),
    ...(page.sections ? { sections: page.sections } : {}),
  }
}

/** Enough of the text to recognise the page; the app shows a few lines of it. */
const EXCERPT_CHARS = 800

/** What `sources preview` answers: the page as `sources add` would keep it, without the text itself. */
export const previewOf = (read: ReadSource) => {
  const flat = read.text.replace(/\s+/g, " ").trim()
  return {
    url: read.url ?? null,
    title: read.title,
    site: read.url ? new URL(read.url).hostname : null,
    description: metaText(read.metadata, "description"),
    // By code point, so an emoji at the cut is never split into half a character.
    excerpt: flat ? Array.from(flat).slice(0, EXCERPT_CHARS).join("") : null,
    kind: read.kind,
    mime: read.mime ?? null,
    read: read.read,
    // The store keeps the text trimmed, and sources add answers its length.
    chars: read.text.trim().length,
    truncated: read.truncated,
  }
}
