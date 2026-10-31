import { CliError } from "@wirecat/cli-base"
import type { MailSource, Quick } from "@wirecat/cli-core/mail"
import {
  addLabels,
  listAllMail,
  listImapMail,
  moveMessages,
  searchMail,
  specialFolders,
  uidsOfMessages,
  uidsPresent,
} from "./gmail.js"
import type { Himalaya } from "./himalaya.js"

const BATCH_COUNT = 50
const BATCH_BYTES = 20 * 1024 * 1024
const MIN_BUFFER = 64 * 1024 * 1024

/** One IMAP call reads one folder, so items are grouped by folder first; the newest-first order mixes folders. */
const batchesOf = (items: Quick[]): Quick[][] => {
  const byFolder = new Map<string | undefined, Quick[]>()
  for (const item of items) {
    const group = byFolder.get(item.folder)
    if (group) group.push(item)
    else byFolder.set(item.folder, [item])
  }
  const batches: Quick[][] = []
  for (const group of byFolder.values()) {
    let current: Quick[] = []
    let bytes = 0
    for (const item of group) {
      const size = item.size ?? 0
      if (current.length > 0 && (current.length >= BATCH_COUNT || bytes + size > BATCH_BYTES)) {
        batches.push(current)
        current = []
        bytes = 0
      }
      current.push(item)
      bytes += size
    }
    if (current.length > 0) batches.push(current)
  }
  return batches
}

export const himalayaSource = (
  run: Himalaya,
  account: { name: string; mode?: "gmail" | "imap" | "mbox" },
): MailSource => {
  const fetchBatch = async (batch: Quick[]): Promise<Map<string, Uint8Array>> => {
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
    list: async (since, folder, options) =>
      account.mode === "imap"
        ? listImapMail(run, account.name, since, folder, options?.searched)
        : (await listAllMail(run, account.name, since, folder, options?.headers, options?.searched)).map((item) => ({
            ...item,
            folder,
          })),

    search: (since, folder) => searchMail(run, account.name, since, folder),

    ...(account.mode === undefined || account.mode === "gmail"
      ? {
          find: async (messageIds: readonly string[], folder: string, options: { headers?: boolean } = {}) => {
            const uids = await uidsOfMessages(run, account.name, messageIds, folder)
            if (uids.length === 0) return []
            // The window is unused: `searched` names the UIDs, so nothing is listed by date.
            const listed = await listAllMail(run, account.name, new Date(0), folder, options.headers ?? false, { uids })
            return listed.map((item) => ({ ...item, folder }))
          },
          move: (messageIds: readonly string[], from: string, to: string, known?: ReadonlyMap<string, string>) =>
            moveMessages(run, account.name, messageIds, from, to, known),
          folders: () => specialFolders(run, account.name),
          present: (uids: readonly string[], folder: string) => uidsPresent(run, account.name, uids, folder),
          label: (messageIds: readonly string[], folder: string, labels: readonly string[]) =>
            addLabels(run, account.name, messageIds, folder, labels),
        }
      : {}),

    fetchRaw: async (items) => {
      const read = new Map<Quick, Uint8Array | Error>()
      const settle = async (batch: Quick[]) => {
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
