import { CliError } from "@wirecat/cli-base"
import { type Listed, listAllMail, listImapMail } from "./gmail.js"
import type { Himalaya } from "./himalaya.js"

export type { Listed }

/** Everything the import asks of a mail client, so himalaya can be replaced without touching the import. */
export interface MailSource {
  /** Every message in `folder` received since `since`; all or nothing, since deletions are proved from it. */
  list(since: Date, folder: string): Promise<Listed[]>
  /** Each item's raw RFC 5322 bytes, in order; one that could not be read is an Error, not a failed call. */
  fetchRaw(items: Listed[]): Promise<(Uint8Array | Error)[]>
}

const BATCH_COUNT = 50
const BATCH_BYTES = 20 * 1024 * 1024
const MIN_BUFFER = 64 * 1024 * 1024

const batchesOf = (items: Listed[]): Listed[][] => {
  const batches: Listed[][] = []
  let current: Listed[] = []
  let bytes = 0
  for (const item of items) {
    const size = item.size ?? 0
    if (
      current.length > 0 &&
      (current.length >= BATCH_COUNT || bytes + size > BATCH_BYTES || current[0]?.folder !== item.folder)
    ) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(item)
    bytes += size
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export const himalayaSource = (run: Himalaya, account: { name: string; mode?: "gmail" | "imap" }): MailSource => {
  const fetchBatch = async (batch: Listed[]): Promise<Map<string, Uint8Array>> => {
    const bytes = batch.reduce((sum, item) => sum + (item.size ?? 0), 0)
    const output = await run(
      [
        "--json",
        "imap",
        "fetch",
        batch.map(({ uid }) => uid).join(","),
        "--body",
        "-m",
        batch[0]?.folder ?? "",
        "-a",
        account.name,
      ],
      undefined,
      // Base64 and JSON make the answer ~1.4 times the mail; one large email must not overflow a fixed buffer.
      { maxBuffer: Math.max(MIN_BUFFER, bytes * 2) },
    )
    let messages: unknown
    try {
      messages = (JSON.parse(output) as { messages?: unknown }).messages
    } catch {
      throw new CliError("invalid_response", "himalaya imap fetch did not answer JSON")
    }
    if (!Array.isArray(messages)) throw new CliError("invalid_response", "himalaya imap fetch answered no messages")
    const found = new Map<string, Uint8Array>()
    for (const { uid, body } of messages as { uid?: unknown; body?: unknown }[])
      if (typeof body === "string") found.set(String(uid), Buffer.from(body, "base64"))
    return found
  }

  return {
    list: async (since, folder) =>
      account.mode === "imap"
        ? listImapMail(run, account.name, since, folder)
        : (await listAllMail(run, account.name, since, folder)).map((item) => ({ ...item, folder })),

    fetchRaw: async (items) => {
      const read = new Map<Listed, Uint8Array | Error>()
      const settle = async (batch: Listed[]) => {
        const found = await fetchBatch(batch)
        for (const item of batch)
          read.set(item, found.get(item.uid) ?? new CliError("not_found", `email ${item.uid} was not returned`))
      }
      for (const batch of batchesOf(items)) {
        try {
          await settle(batch)
        } catch (error) {
          // Retried one by one, so one email the server or himalaya cannot give costs only itself.
          for (const item of batch)
            try {
              if (batch.length > 1) await settle([item])
              else throw error
            } catch (single) {
              read.set(item, single instanceof Error ? single : new Error(String(single)))
            }
        }
      }
      return items.map((item) => read.get(item) as Uint8Array | Error)
    },
  }
}
