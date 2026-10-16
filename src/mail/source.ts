import { CliError } from "@wirecat/cli-base"
import {
  addLabels,
  type Listed,
  listAllMail,
  listImapMail,
  moveMessages,
  type Searched,
  searchMail,
  specialFolders,
  uidsOfMessages,
  uidsPresent,
} from "./gmail.js"
import type { Himalaya } from "./himalaya.js"
import type { FileStamp } from "./resume.js"

export type { Listed, Searched }

/** Everything the import asks of a mail client, so himalaya can be replaced without touching the import. */
export interface MailSource {
  /**
   * Every message in `folder` received since `since`; all or nothing, since deletions are proved from it.
   * `headers` also reads From, To, Cc and the list fields, for the probe and the owner's rules.
   */
  list(since: Date, folder: string, options?: { headers?: boolean; searched?: Searched }): Promise<Listed[]>
  /**
   * The folder's UIDs in the window and its UIDVALIDITY, without reading a message; `list` given them reads only
   * those. Absent for a file, which has no UIDs.
   */
  search?(since: Date, folder: string): Promise<Searched>
  /** A file's size and modification time, so an unchanged file read to the end is not read again. */
  stamp?(): Promise<FileStamp>
  /**
   * The messages of `folder` with these Gmail ids, listed as `list` lists them; a message no longer there is left
   * out. Absent where messages have no Gmail id: a file, or plain IMAP.
   */
  find?(messageIds: readonly string[], folder: string): Promise<Listed[]>
  /**
   * Moves messages by Gmail id between folders on the server; ids `from` does not hold come back as missing.
   * `known` gives each id's UID in `from`, already read, so none is looked up again.
   */
  move?(
    messageIds: readonly string[],
    from: string,
    to: string,
    known?: ReadonlyMap<string, string>,
  ): Promise<{ moved: string[]; missing: string[] }>
  /** All Mail and Trash under the names this account's language gives them. */
  folders?(): Promise<{ all: string; trash: string }>
  /** Which of these UIDs `folder` still holds. */
  present?(uids: readonly string[], folder: string): Promise<string[]>
  /** Puts labels back on messages in `folder`, by Gmail id. */
  label?(messageIds: readonly string[], folder: string, labels: readonly string[]): Promise<void>
  /** Each item's raw RFC 5322 bytes, in order; one that could not be read is an Error, not a failed call. */
  fetchRaw(items: Listed[]): Promise<(Uint8Array | Error)[]>
}

const BATCH_COUNT = 50
const BATCH_BYTES = 20 * 1024 * 1024
const MIN_BUFFER = 64 * 1024 * 1024

/** One IMAP call reads one folder, so items are grouped by folder first; the newest-first order mixes folders. */
const batchesOf = (items: Listed[]): Listed[][] => {
  const byFolder = new Map<string | undefined, Listed[]>()
  for (const item of items) {
    const group = byFolder.get(item.folder)
    if (group) group.push(item)
    else byFolder.set(item.folder, [item])
  }
  const batches: Listed[][] = []
  for (const group of byFolder.values()) {
    let current: Listed[] = []
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
          find: async (messageIds: readonly string[], folder: string) => {
            const uids = await uidsOfMessages(run, account.name, messageIds, folder)
            if (uids.length === 0) return []
            // The window is unused: `searched` names the UIDs, so nothing is listed by date.
            const listed = await listAllMail(run, account.name, new Date(0), folder, false, { uids })
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
