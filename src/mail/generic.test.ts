import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openStore } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { listImapMail } from "./gmail.js"
import type { Himalaya } from "./himalaya.js"
import { importMail } from "./import.js"

const runner =
  (validity: string, folder: string, fail = false): Himalaya =>
  async (_args, input = "") => {
    if (input.includes("UID SEARCH"))
      return `* OK [UIDVALIDITY ${validity}] ready\r\na OK selected\r\n* SEARCH 7\r\nb OK searched\r\n`
    if (fail) return "a OK selected\r\nf OK fetched\r\n"
    return `a OK selected\r\n* 1 FETCH (UID 7 INTERNALDATE "08-Oct-2026 09:00:00 +0000" BODY[HEADER.FIELDS (MESSAGE-ID REFERENCES IN-REPLY-TO)] {60}\r\nMessage-ID: <synthetic@example.test>\r\nReferences: <root@example.test>\r\n\r\n)\r\nf OK fetched ${folder}\r\n`
  }
describe("generic IMAP identities", () => {
  it("does not treat a mailbox outside the selected folder scope as deleted on later runs", async () => {
    const store = await openStore({ path: join(mkdtempSync(join(tmpdir(), "memo-folder-scope-")), "store.db") })
    let present = true
    const run: Himalaya = async (args, input = "") => {
      if (args[0] === "imap")
        return input.includes("UID SEARCH")
          ? `a OK selected\r\n* SEARCH${present ? " 1" : ""}\r\nb OK searched\r\n`
          : 'a OK selected\r\n* 1 FETCH (UID 1 X-GM-MSGID 9001 X-GM-THRID 7001 INTERNALDATE "08-Oct-2026 09:00:00 +0000")\r\nf0 OK fetched\r\n'
      return JSON.stringify({
        text_body: [0],
        html_body: [],
        parts: [{ headers: [], body: { Text: "Synthetic source" } }],
      })
    }
    const options = {
      store,
      run,
      since: new Date("2026-10-01T00:00:00Z"),
      now: () => Date.parse("2026-10-08T12:00:00Z"),
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    }
    try {
      await importMail({
        ...options,
        account: { name: "synthetic", address: "owner@example.test", folders: ["Archive"] },
      })
      present = false
      const selected = { name: "synthetic", address: "owner@example.test", folders: ["INBOX"] }
      expect((await importMail({ ...options, account: selected })).deleted).toBe(0)
      expect((await importMail({ ...options, account: selected })).deleted).toBe(0)
      expect(
        await store.message({ provider: "email", account: selected.address }, "9001", { chatId: "7001" }),
      ).toBeDefined()
    } finally {
      await store.close()
    }
  })
  it("keeps Message-ID and reference-thread identities through folder moves and UIDVALIDITY resets", async () => {
    const since = new Date("2026-10-01T00:00:00Z")
    const [first] = await listImapMail(runner("12", "INBOX"), "synthetic", since, "INBOX")
    const [moved] = await listImapMail(runner("99", "Archive"), "synthetic", since, "Archive")
    expect(first?.messageId).toBe(moved?.messageId)
    expect(first?.threadId).toBe(moved?.threadId)
    expect(first?.receivedAt).toBe("2026-10-08T09:00:00.000Z")
    await expect(listImapMail(runner("12", "INBOX", true), "synthetic", since, "INBOX")).rejects.toMatchObject({
      code: "invalid_response",
    })
    await expect(listImapMail(runner("12", "INBOX"), "synthetic", since, "INBOX\r\nUID STORE")).rejects.toMatchObject({
      code: "validation_error",
    })
  })
})
