import { open } from "node:fs/promises"
import { CliError } from "@wirecat/cli-base"
import { envelopeOfText, type IngestError, isVcard, type VcardIssue } from "@wirecat/cli-core"
import { type IngestReceipt, ingest, ingestLines, ingestVcard, jsonlLines } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"

/** `vcard` holds the converter's notices, each `card` counted from 1. */
export type Receipt = IngestReceipt & { vcard?: VcardIssue[] }

/** A vCard address book is a phone's contacts: they go under the seeded `phone` provider, one account per device. */
const PHONE = "phone"

const BOM = /^\uFEFF/

const errnoOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined

/** A file opened now, so a missing one fails before anything is read; its errors come as answers, not as errno. */
const linesOf = async (file: string, stdin: NodeJS.ReadableStream): Promise<AsyncIterable<string>> => {
  if (file === "-") return jsonlLines(stdin)
  try {
    const handle = await open(file)
    if (!(await handle.stat()).isFile()) {
      await handle.close()
      throw Object.assign(new Error(`${file} is a folder`), { code: "EISDIR" })
    }
    return jsonlLines(handle.createReadStream({ encoding: "utf8" }))
  } catch (error) {
    if (errnoOf(error) === "ENOENT")
      throw new CliError("not_found", `no records file ${file}: give a file that exists, or - for stdin`, {
        reason: "records.file-missing",
        path: file,
      })
    const why =
      errnoOf(error) === "EISDIR" ? "it is a folder" : errnoOf(error) === "EACCES" ? "no permission" : "unreadable"
    throw new CliError("validation_error", `the records file ${file} cannot be read: ${why}`, {
      reason: "records.file-unreadable",
      path: file,
      why,
    })
  }
}

/** A JSONL file's first line: an object holding no `records`. */
const headerOf = (line: string): Record<string, unknown> | undefined => {
  try {
    const value = JSON.parse(line) as unknown
    return value && typeof value === "object" && !Array.isArray(value) && !("records" in value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** `sheet:rentals` names the envelope's provider and account, as records list and link take it. */
const accountIn = (envelope: unknown, given: string): string => {
  const provider = (envelope as { source?: { provider?: unknown } } | null)?.source?.provider
  return typeof provider === "string" && given.startsWith(`${provider}:`) ? given.slice(provider.length + 1) : given
}

const deviceOf = (given: string): string => {
  const at = given.indexOf(":")
  if (at < 0) return given
  if (given.slice(0, at) !== PHONE)
    throw new CliError("validation_error", "a vCard file holds a phone's contacts: --account phone:<device>", {
      param: "--account",
    })
  return given.slice(at + 1)
}

/**
 * Imports a records file or stdin. JSONL streams, a record at a time, so a file of any length fits in memory; a JSON
 * envelope and a vCard address book are read whole, as one envelope each. `onIssue` hears every refusal as it
 * happens, also those past the receipt's capped lists.
 */
export const importRecords = async (
  store: MessageStore,
  {
    file,
    stdin,
    account,
    dryRun,
    onIssue,
  }: {
    file: string
    stdin: NodeJS.ReadableStream
    account: string
    dryRun: boolean
    onIssue: (issue: IngestError) => void
  },
): Promise<Receipt> => {
  const iterator = (await linesOf(file, stdin))[Symbol.asyncIterator]()
  const before: string[] = []
  let next = await iterator.next()
  while (!next.done && next.value.replace(BOM, "").trim() === "") {
    before.push(next.value)
    next = await iterator.next()
  }
  async function* rest(): AsyncIterable<string> {
    for (let line = await iterator.next(); !line.done; line = await iterator.next()) yield line.value
  }
  const whole = async (first: string[]) => {
    const lines = [...before, ...first]
    for await (const line of rest()) lines.push(line)
    return lines.join("\n")
  }
  if (next.done) return ingest(store, envelopeOfText(before.join("\n")), { account, dryRun, onIssue })
  const first = next.value.replace(BOM, "")
  if (isVcard(first)) {
    const { vcard, ...receipt } = await ingestVcard(store, await whole([first]), {
      account: deviceOf(account),
      provider: PHONE,
      batchId: `vcard-${new Date().toISOString()}`,
      dryRun,
      onIssue,
    })
    return { ...receipt, vcard: vcard.map((one) => ({ ...one, card: one.card + 1 })) }
  }
  const header = headerOf(first)
  if (header !== undefined) {
    async function* all(): AsyncIterable<string> {
      // A refused header stops the stream at its first line; the file is closed here, not when it is collected.
      try {
        yield first
        yield* rest()
      } finally {
        await iterator.return?.()
      }
    }
    return ingestLines(store, all(), { account: accountIn(header, account), dryRun, onIssue })
  }
  const envelope = envelopeOfText(await whole([first]))
  return ingest(store, envelope, { account: accountIn(envelope, account), dryRun, onIssue })
}
