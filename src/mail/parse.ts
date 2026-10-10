import { CliError } from "@wirecat/cli-core"

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

interface Part {
  headers: { name: string | { other: string }; value: Record<string, unknown> | string }[]
  body: Record<string, unknown> | string
}

interface Parsed {
  text_body: number[]
  html_body: number[]
  parts: Part[]
  attachments?: number[]
}

const MAX_TEXT = 20_000

const addresses = (value: unknown): Address[] => {
  const address = (value as { Address?: unknown })?.Address as
    | { List?: { address?: string | null; name?: string | null }[] }
    | { Group?: { addresses?: { address?: string | null; name?: string | null }[] }[] }
    | undefined
  const list =
    address !== undefined && "List" in address
      ? (address.List ?? [])
      : address !== undefined && "Group" in address
        ? (address.Group ?? []).flatMap((group) => group.addresses ?? [])
        : []
  return list.flatMap(({ address: email, name }) => (email ? [{ email: email.toLowerCase(), name: name ?? null }] : []))
}

const bodyText = (part: Part | undefined, kind: "Text" | "Html"): string => {
  const body = part?.body
  return typeof body === "object" && body !== null && typeof body[kind] === "string" ? (body[kind] as string) : ""
}

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

/** `himalaya --json message read`: the `mail-parser` crate's message, serialised as it is. */
export const parseMail = (json: string): ParsedMail => {
  let parsed: Parsed
  try {
    parsed = JSON.parse(json) as Parsed
  } catch {
    throw new CliError("invalid_response", "himalaya message read did not answer JSON")
  }
  if (!parsed || !Array.isArray(parsed.parts) || !Array.isArray(parsed.text_body) || !Array.isArray(parsed.html_body))
    throw new CliError("invalid_response", "himalaya returned an incomplete parsed message")
  if (parsed.attachments !== undefined && !Array.isArray(parsed.attachments))
    throw new CliError("invalid_response", "himalaya returned invalid attachment metadata")
  const headers = parsed.parts[0]?.headers ?? []
  const header = (name: string) => headers.find((item) => item.name === name)?.value
  const subject = (header("subject") as { Text?: string } | undefined)?.Text ?? null

  const plain = parsed.text_body
    .map((index) => bodyText(parsed.parts[index], "Text"))
    .join("\n\n")
    .trim()
  const text = plain || htmlToText(parsed.html_body.map((index) => bodyText(parsed.parts[index], "Html")).join("\n"))

  return {
    subject,
    from: addresses(header("from"))[0] ?? null,
    to: [...addresses(header("to")), ...addresses(header("cc"))],
    cc: addresses(header("cc")),
    bcc: addresses(header("bcc")),
    attachments: (parsed.attachments ?? []).slice(0, 50).map((id) => {
      const part = parsed.parts[id]
      const value = (name: string) =>
        part?.headers.find((item) => typeof item.name === "string" && item.name.replaceAll("_", "-") === name)?.value
      const type = (
        value("content-type") as
          | {
              ContentType?: {
                c_type?: string
                c_subtype?: string
                attributes?: { name?: string; attribute?: string; value?: string }[]
              }
            }
          | undefined
      )?.ContentType
      const disposition = (
        value("content-disposition") as
          | { ContentType?: { attributes?: { name?: string; attribute?: string; value?: string }[] } }
          | undefined
      )?.ContentType
      const attrs = [...(disposition?.attributes ?? []), ...(type?.attributes ?? [])]
      const name =
        attrs.find((attr) => ["filename", "name"].includes(attr.name ?? attr.attribute ?? ""))?.value ??
        `attachment-${id}`
      const raw =
        typeof part?.body === "object" && part.body !== null ? (part.body.Binary ?? part.body.InlineBinary) : undefined
      let bytes: Uint8Array | null = null
      if (
        Array.isArray(raw) &&
        raw.length <= 50 * 1024 * 1024 &&
        raw.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
      )
        bytes = Uint8Array.from(raw)
      else if (typeof raw === "string" && raw.length <= 70_000_000 && /^[A-Za-z0-9+/]*={0,2}$/.test(raw))
        bytes = Buffer.from(raw, "base64")
      else if (typeof part?.body === "object" && part.body !== null && typeof part.body.Text === "string")
        bytes = new TextEncoder().encode(part.body.Text)
      else if (typeof part?.body === "object" && part.body !== null && typeof part.body.Html === "string")
        bytes = new TextEncoder().encode(htmlToText(part.body.Html))
      return {
        id,
        name: name.slice(0, 200),
        mime: type?.c_type ? `${type.c_type}/${type.c_subtype ?? "octet-stream"}` : null,
        bytes,
      }
    }),
    text: text.replace(/\r\n?/g, "\n").slice(0, MAX_TEXT),
  }
}
