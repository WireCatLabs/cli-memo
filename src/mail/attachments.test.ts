import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatLocator } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { describe, expect, it } from "vitest"
import type { Himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import { himalayaSource } from "./source.js"

describe("read-only email attachment sources", () => {
  it("keeps attachment text on its email, and drops it when the mail disappears", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-attachment-")),
      store = await openStore({ path: join(root, "store.db") })
    const key = { provider: "email", account: "owner@example.test" }
    let present = true
    const fetched = (raw: string) =>
      JSON.stringify({ messages: [{ uid: 1, body: Buffer.from(raw).toString("base64") }] })
    const run: Himalaya = async (args, input = "") => {
      if (args[0] === "imap") {
        expect(input).not.toMatch(/SELECT |UID STORE|EXPUNGE/)
        if (input.includes("UID SEARCH")) return `a OK selected\r\n* SEARCH${present ? " 1" : ""}\r\nb OK searched\r\n`
        return 'a OK selected\r\n* 1 FETCH (UID 1 X-GM-MSGID 9001 X-GM-THRID 7001 INTERNALDATE "08-Oct-2026 09:00:00 +0000")\r\nf0 OK fetched\r\n'
      }
      expect(args).not.toContain("--seen")
      return fetched(
        [
          "Subject: Synthetic subject",
          'From: "Rin Synthetic" <rin@example.test>',
          'Content-Type: multipart/mixed; boundary="b"',
          "",
          "--b",
          "Content-Type: text/plain",
          "",
          "Synthetic body",
          "--b",
          'Content-Type: text/csv; name="budget.csv"',
          "Content-Disposition: attachment",
          "",
          "name,value",
          "Synthetic,123",
          "--b--",
          "",
        ].join("\r\n"),
      )
    }
    const input = {
      store,
      source: himalayaSource(run, { name: "synthetic" }),
      account: { name: "synthetic", address: key.account },
      since: new Date("2026-10-01T00:00:00Z"),
      now: () => Date.parse("2026-10-08T12:00:00Z"),
    }
    try {
      const first = await importMail(input)
      expect(first.attachments).toEqual([{ message: "9001", part: 0, status: "extracted" }])
      const locator = formatLocator({ ...key, chat: "7001", message: "9001" })
      const note = await store.knowledge.addAnnotation(key, { type: "message", locator }, "Own analysis")
      expect((await importMail(input)).deleted).toBe(0)
      const { id } = await store.storedAccount(key)
      expect((await store.mail.email(id, "9001"))?.attachments[0]).toMatchObject({
        name: "budget.csv",
        providerRef: { message: "9001", part: 0 },
      })
      expect((await store.mail.email(id, "9001"))?.attachments[0]?.text).toContain("name: Synthetic; value: 123")
      present = false
      expect((await importMail(input)).deleted).toBe(1)
      expect((await store.mail.email(id, "9001"))?.attachments[0]?.text).toBeNull()
      expect(await store.knowledge.annotation(key, note.id)).toMatchObject({
        targetState: "deleted",
        text: "Own analysis",
      })
    } finally {
      await store.close()
    }
  })
})
