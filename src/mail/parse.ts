import { CliError } from "@leemour/cli-core"

export interface Address {
  email: string
  name: string | null
}

export interface ParsedMail {
  subject: string | null
  from: Address | null
  to: Address[]
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
    text: text.slice(0, MAX_TEXT),
  }
}
