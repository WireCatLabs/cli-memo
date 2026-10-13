import { CliError } from "@wirecat/cli-base"
import PostalMime, { type Address as PostalAddress } from "postal-mime"

export interface Address {
  email: string
  name: string | null
}

export interface ParsedMail {
  subject: string | null
  from: Address | null
  to: Address[]
  cc: Address[]
  bcc: Address[]
  attachments: { id: number; name: string; mime: string | null; bytes: Uint8Array | null }[]
  text: string
}

// The store cuts a body into pieces itself; this only guards against a pathological one, like a pasted log.
export const MAX_BODY_CHARS = 1_000_000

const addresses = (list: PostalAddress[]): Address[] =>
  list
    .flatMap((entry) => entry.group ?? [entry])
    .flatMap(({ address, name }) => (address ? [{ email: address.toLowerCase(), name: name || null }] : []))

const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

const bytesOf = (content: ArrayBuffer | Uint8Array | string): Uint8Array =>
  typeof content === "string"
    ? new TextEncoder().encode(content)
    : content instanceof Uint8Array
      ? content
      : new Uint8Array(content)

/** A raw RFC 5322 message, as IMAP's `BODY[]` holds it. */
export const parseMail = async (raw: Uint8Array, maxBodyChars = MAX_BODY_CHARS): Promise<ParsedMail> => {
  let email: Awaited<ReturnType<typeof PostalMime.parse>>
  try {
    email = await PostalMime.parse(raw)
  } catch (error) {
    throw new CliError("invalid_response", `unreadable email: ${error instanceof Error ? error.message : error}`)
  }
  const text = email.text?.trim() || htmlToText(email.html ?? "")
  return {
    subject: email.subject ?? null,
    from: addresses(email.from === undefined ? [] : [email.from])[0] ?? null,
    to: addresses(email.to ?? []),
    cc: addresses(email.cc ?? []),
    bcc: addresses(email.bcc ?? []),
    attachments: email.attachments.slice(0, 50).map((part, id) => ({
      id,
      name: (part.filename ?? `attachment-${id}`).slice(0, 200),
      mime: part.mimeType || null,
      bytes: bytesOf(part.content),
    })),
    text: text.replace(/\r\n?/g, "\n").slice(0, maxBodyChars),
  }
}
