import { createHash } from "node:crypto"

/**
 * cli-core keys a document by `<namespace>:[A-Za-z0-9._~-]{1,200}`; this leaves room for the namespace. A longer id
 * keeps its readable start and ends with `~~` and a hash of the whole path, which no escape can produce.
 */
const MOST = 180
const HASHED_HEAD = 160

const PLAIN = /[A-Za-z0-9._-]/

/**
 * A path relative to the folder as an external id: NFC first, because macOS writes names decomposed and the same file
 * would get a second id; then each UTF-8 byte outside `[A-Za-z0-9._-]` as `~XX`, `~` and `/` included, so two paths
 * never share an id and the id reads back with `pathOfId`.
 */
export const idOfPath = (relative: string): string => {
  const normalized = relative.split(/[\\/]/).join("/").normalize("NFC")
  let id = ""
  for (const char of normalized) {
    if (PLAIN.test(char)) id += char
    else for (const byte of Buffer.from(char)) id += `~${byte.toString(16).toUpperCase().padStart(2, "0")}`
  }
  if (id.length <= MOST) return id
  const head = id.slice(0, HASHED_HEAD).replace(/~[0-9A-F]?$/, "")
  return `${head}~~${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`
}

/** The path an id stands for; `undefined` for one shortened with a hash, which only the folder can answer. */
export const pathOfId = (id: string): string | undefined => {
  if (id.includes("~~")) return undefined
  const bytes: number[] = []
  for (let at = 0; at < id.length; at++) {
    if (id[at] === "~") {
      bytes.push(Number.parseInt(id.slice(at + 1, at + 3), 16))
      at += 2
    } else bytes.push(id.charCodeAt(at))
  }
  return Buffer.from(bytes).toString("utf8")
}
