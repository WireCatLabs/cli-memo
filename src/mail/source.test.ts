import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openStore } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"
import type { Listed } from "./gmail.js"
import type { Himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import { himalayaSource } from "./source.js"

const item = (uid: number, size = 1000): Listed => ({
  uid: String(uid),
  messageId: String(9000 + uid),
  threadId: String(9000 + uid),
  receivedAt: "2026-09-10T08:00:00.000Z",
  folder: "[Gmail]/All Mail",
  size,
})

const answer = (uids: string[]) =>
  JSON.stringify({
    messages: uids.map((uid) => ({
      uid: Number(uid),
      body: Buffer.from(`Subject: ${uid}\r\n\r\nx`).toString("base64"),
    })),
  })

describe("himalayaSource.fetchRaw", () => {
  it("fetches up to 50 emails or 20 MB per call, and a larger email alone", async () => {
    const calls: { uids: string[]; maxBuffer?: number }[] = []
    const run: Himalaya = async (args, _input, options) => {
      const uids = (args[3] ?? "").split(",")
      calls.push({ uids, ...(options?.maxBuffer === undefined ? {} : { maxBuffer: options.maxBuffer }) })
      return answer(uids)
    }
    const items = [
      ...Array.from({ length: 60 }, (_, n) => item(n + 1)),
      item(61, 15_000_000),
      item(62, 10_000_000),
      item(63, 50_000_000),
    ]

    const raws = await himalayaSource(run, { name: "test" }).fetchRaw(items)

    expect(calls.map(({ uids }) => uids.length)).toEqual([50, 11, 1, 1])
    expect(calls[3]?.maxBuffer).toBeGreaterThan(50_000_000 * 1.4)
    expect(raws.every((raw) => raw instanceof Uint8Array)).toBe(true)
  })

  it("fetches each folder's emails together, and answers in the order asked", async () => {
    const folders: string[] = []
    const run: Himalaya = async (args) => {
      folders.push(args[args.indexOf("-m") + 1] ?? "")
      return answer((args[3] ?? "").split(","))
    }
    const items = [1, 2, 3, 4].map((uid) => ({ ...item(uid), folder: uid % 2 ? "INBOX" : "Archive" }))

    const raws = await himalayaSource(run, { name: "test", mode: "imap" }).fetchRaw(items)

    expect(folders).toEqual(["INBOX", "Archive"])
    expect(raws.map((raw) => new TextDecoder().decode(raw as Uint8Array).split("\r\n")[0])).toEqual([
      "Subject: 1",
      "Subject: 2",
      "Subject: 3",
      "Subject: 4",
    ])
  })

  it("reads a failed batch one email at a time, so a bad email costs only itself", async () => {
    const run: Himalaya = async (args) => {
      const uids = (args[3] ?? "").split(",")
      if (uids.includes("2")) throw new Error("himalaya imap failed")
      return answer(uids)
    }

    const raws = await himalayaSource(run, { name: "test" }).fetchRaw([item(1), item(2), item(3)])

    expect(raws.map((raw) => (raw instanceof Error ? "error" : "read"))).toEqual(["read", "error", "read"])
  })
})

describe("listing a large mailbox", () => {
  it("lists 150,000 emails in parts and imports none of them with max 0", async () => {
    const count = 150_000
    const uids = Array.from({ length: count }, (_, n) => String(n + 1))
    let largest = 0
    const run: Himalaya = async (_args, input = "") => {
      if (input.includes("UID SEARCH")) return `a OK selected\r\n* SEARCH ${uids.join(" ")}\r\nb OK searched\r\n`
      const lines = ["a OK selected"]
      let asked = 0
      for (const [, tag, set = "", labels] of input.matchAll(/^(\w+) UID FETCH ([\d,]+) \((UID X-GM-LABELS)?/gm)) {
        const batch = set.split(",")
        asked += batch.length
        for (const uid of batch)
          lines.push(
            labels
              ? `* ${uid} FETCH (UID ${uid} X-GM-LABELS () FLAGS (\\Seen))`
              : `* ${uid} FETCH (UID ${uid} X-GM-MSGID ${uid} X-GM-THRID ${uid} INTERNALDATE "08-Oct-2026 09:00:00 +0000" RFC822.SIZE 100)`,
          )
        lines.push(`${tag} OK done`)
      }
      largest = Math.max(largest, asked)
      return `${lines.join("\r\n")}\r\n`
    }
    const store = await openStore({ path: join(mkdtempSync(join(tmpdir(), "memo-large-")), "store.db") })
    try {
      const result = await importMail({
        store,
        source: himalayaSource(run, { name: "test" }),
        account: { name: "test", address: "owner@example.test" },
        since: new Date("2026-10-01T00:00:00Z"),
        max: 0,
        now: () => Date.parse("2026-10-08T12:00:00Z"),
        indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
        embedMail: async () => ({ chunks: 0, left: false }),
      })
      expect(result).toMatchObject({ listed: count, saved: 0, complete: false })
      expect(largest).toBe(10_000)
    } finally {
      await store.close()
    }
  })
})
