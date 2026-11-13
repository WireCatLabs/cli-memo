import { createHash } from "node:crypto"
import { constants, type Dirent, type Stats } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import { basename, extname, join, relative, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { MAX_FILE_BYTES } from "@wirecat/cli-core/documents"
import { idOfPath } from "./external-id.js"

/** A whole tree is walked before anything is written; past these the folder is refused rather than read in part. */
export const MOST_FILES = 10_000
const DEEPEST = 32

/**
 * The envelope refuses a record whose fields pass 64 KiB as JSON; the title, the address and the metadata get the
 * rest. A longer text is cut and the receipt says so.
 */
const FIELDS_BYTES = 64 * 1024 - 2048

export const TEXT_EXTENSIONS: Readonly<Record<string, string>> = {
  ".txt": "text",
  ".text": "text",
  ".md": "markdown",
  ".markdown": "markdown",
}

export interface FoundFile {
  path: string
  /** As found under the folder, `/` between parts; for one file given alone, its name. */
  relative: string
  extension: string
  stat: Stats
}

export interface Skipped {
  path: string
  reason: string
}

const refusedLink = "a symbolic link is not followed: give the folder it points at"

/** Opened without following a link, so a file swapped for one after the walk is refused too. */
export const readBytes = async (path: string, size: number): Promise<Uint8Array> => {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const bytes = new Uint8Array(size)
    const { bytesRead } = await handle.read(bytes, 0, size, 0)
    return bytes.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

const isInside = (root: string, path: string) => path === root || path.startsWith(root + sep)

/**
 * Every regular file under `root`, or `root` itself when it is a file. Links are refused, not followed, and every
 * file's real path must stay under the folder's. Names starting with `.` (`.git`, `.obsidian`) are left out.
 */
export const walk = async (root: string): Promise<{ files: FoundFile[]; skipped: Skipped[]; base: string }> => {
  // The folder the owner names may itself be a link; only what is inside it may not.
  const real = await realpath(root)
  const files: FoundFile[] = []
  const skipped: Skipped[] = []
  const stat = await lstat(real)
  if (!stat.isDirectory()) {
    if (!stat.isFile()) return { files, skipped: [{ path: root, reason: "not a file or a folder" }], base: real }
    const name = basename(real)
    return {
      files: [{ path: real, relative: name, extension: extname(name).toLowerCase(), stat }],
      skipped,
      base: real,
    }
  }
  const visit = async (folder: string, depth: number): Promise<void> => {
    if (depth > DEEPEST) {
      skipped.push({ path: relative(real, folder), reason: `deeper than ${DEEPEST} folders` })
      return
    }
    const entries: Dirent[] = await readdir(folder, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      const path = join(folder, entry.name)
      const shown = relative(real, path).split(sep).join("/")
      if (entry.isSymbolicLink()) {
        skipped.push({ path: shown, reason: refusedLink })
        continue
      }
      if (!isInside(real, await realpath(path))) {
        skipped.push({ path: shown, reason: "outside the folder" })
        continue
      }
      if (entry.isDirectory()) {
        await visit(path, depth + 1)
        continue
      }
      if (!entry.isFile()) {
        skipped.push({ path: shown, reason: "not a file" })
        continue
      }
      if (files.length >= MOST_FILES) throw new TooMany()
      files.push({ path, relative: shown, extension: extname(entry.name).toLowerCase(), stat: await lstat(path) })
    }
  }
  await visit(real, 0)
  return { files, skipped, base: real }
}

export class TooMany extends Error {
  constructor() {
    super(`more than ${MOST_FILES} files`)
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: true })

/** Plain UTF-8 text with its line ends as `\n`; `undefined` for bytes that are not, such as cp1251 or a binary. */
export const utf8Text = (bytes: Uint8Array): string | undefined => {
  if (bytes.includes(0)) return undefined
  try {
    return UTF8.decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n")
  } catch {
    return undefined
  }
}

const FRONT_MATTER = /^---\n[\s\S]*?\n(?:---|\.\.\.)\n/

/** The first Markdown heading, past any front matter; a plain text file has none. */
export const headingOf = (text: string): string | undefined => {
  const body = text.replace(FRONT_MATTER, "")
  for (const line of body.split("\n")) {
    const heading = /^#{1,6}[ \t]+(.+?)[ \t#]*$/.exec(line)?.[1]?.trim()
    if (heading) return heading.slice(0, 200)
  }
  return undefined
}

export const titleOfName = (name: string) => (basename(name).replace(/\.[^.]+$/, "") || basename(name)).slice(0, 200)

export const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

const bytesOf = (value: unknown) => Buffer.byteLength(JSON.stringify(value))

export interface DocumentFields {
  title: string
  text: string
  created_at: string
  updated_at: string
  url: string
  metadata: Record<string, unknown>
}

/**
 * A `document` record's fields: the text cut by code point so the fields fit the envelope's limit, and `metadata`
 * saying where the file was. `revision` is left out on purpose: a restored file goes back in time, and a lower
 * revision would be refused; the fingerprint says whether it changed.
 */
export const documentFields = (
  file: FoundFile,
  { title, text, metadata }: { title: string; text: string; metadata: Record<string, unknown> },
): { fields: DocumentFields; cut: boolean } => {
  const born = file.stat.birthtimeMs > 0 && file.stat.birthtimeMs <= file.stat.mtimeMs ? file.stat.birthtime : null
  const base: DocumentFields = {
    title,
    text: "",
    created_at: (born ?? file.stat.mtime).toISOString(),
    updated_at: file.stat.mtime.toISOString(),
    url: pathToFileURL(file.path).href,
    metadata: { path: file.relative.normalize("NFC"), size: file.stat.size, ...metadata },
  }
  const room = FIELDS_BYTES - bytesOf(base)
  if (bytesOf(text) <= room) return { fields: { ...base, text }, cut: false }
  const points = Array.from(text)
  let low = 0
  let high = points.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (bytesOf(points.slice(0, middle).join("")) <= room - 64) low = middle
    else high = middle - 1
  }
  return {
    fields: { ...base, text: points.slice(0, low).join(""), metadata: { ...base.metadata, truncated: true } },
    cut: true,
  }
}

export interface ReadDocument {
  title: string
  text: string
  metadata: Record<string, unknown>
}

/** A `.txt` or `.md` file's text and title; a refusal names why it was skipped. */
export const readTextFile = async (file: FoundFile): Promise<ReadDocument | { refused: string }> => {
  if (file.stat.size > MAX_FILE_BYTES) return { refused: `larger than ${MAX_FILE_BYTES / 1024 / 1024} MiB` }
  const bytes = await readBytes(file.path, file.stat.size)
  const text = utf8Text(bytes)
  if (text === undefined) return { refused: "not UTF-8 text" }
  if (!text.trim()) return { refused: "holds no text" }
  const format = TEXT_EXTENSIONS[file.extension] ?? "text"
  return {
    title: (format === "markdown" ? headingOf(text) : undefined) ?? titleOfName(file.relative),
    text: text.trim(),
    metadata: { format, sha256: sha256Of(bytes) },
  }
}

/** The envelope's record type for a file's text. */
export const DOCUMENT_TYPE = "document"

export const documentRecord = (file: FoundFile, fields: DocumentFields, type: string) => {
  const id = idOfPath(file.relative)
  return { key: id, type, external_id: id, operation: "upsert" as const, fields }
}
