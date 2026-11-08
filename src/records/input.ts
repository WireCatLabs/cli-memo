import { open } from "node:fs/promises"
import { CliError } from "@wirecat/cli-base"
import { envelopeOfText, isVcard, type VcardIssue } from "@wirecat/cli-core"
import { type IngestReceipt, ingest, ingestLines, ingestVcard, jsonlLines } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"

export type Receipt = IngestReceipt & { vcard?: VcardIssue[] }

/** A vCard address book is a phone's contacts: they go under the seeded `phone` provider, one account per device. */
const PHONE = "phone"

const BOM = /^﻿/

/** A file opened now, so a missing one fails before anything is read, as it did when the whole file was read. */
const linesOf = async (file: string, stdin: NodeJS.ReadableStream): Promise<AsyncIterable<string>> => {
  if (file === "-") return jsonlLines(stdin)
  const handle = await open(file)
  return jsonlLines(handle.createReadStream({ encoding: "utf8" }))
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
 * envelope and a vCard address book are read whole, as one envelope each.
 */
export const importRecords = async (
  store: MessageStore,
  { file, stdin, account, dryRun }: { file: string; stdin: NodeJS.ReadableStream; account: string; dryRun: boolean },
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
  if (next.done) return ingest(store, envelopeOfText(before.join("\n")), { account, dryRun })
  const first = next.value.replace(BOM, "")
  if (isVcard(first))
    return ingestVcard(store, await whole([first]), {
      account: deviceOf(account),
      provider: PHONE,
      batchId: `vcard-${new Date().toISOString()}`,
      dryRun,
    })
  const header = headerOf(first)
  if (header !== undefined) {
    async function* all(): AsyncIterable<string> {
      yield first
      yield* rest()
    }
    return ingestLines(store, all(), { account: accountIn(header, account), dryRun })
  }
  const envelope = envelopeOfText(await whole([first]))
  return ingest(store, envelope, { account: accountIn(envelope, account), dryRun })
}
