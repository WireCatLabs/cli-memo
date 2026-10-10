import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatLocator } from "@wirecat/cli-messaging"
import { openStore } from "@wirecat/cli-messaging/store"
import { describe, expect, it } from "vitest"
import type { Himalaya } from "./himalaya.js"
import { importMail } from "./import.js"

describe("read-only email attachment sources", () => {
  it("indexes attachment text, resumes without losing children and removes source text when mail disappears", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-attachment-")),
      store = await openStore({ path: join(root, "store.db") })
    const key = { provider: "email", account: "owner@example.test" }
    let present = true
    const run: Himalaya = async (args, input = "") => {
      if (args[0] === "imap") {
        expect(input).not.toMatch(/SELECT |UID STORE|EXPUNGE/)
        if (input.includes("UID SEARCH")) return `a OK selected\r\n* SEARCH${present ? " 1" : ""}\r\nb OK searched\r\n`
        return 'a OK selected\r\n* 1 FETCH (UID 1 X-GM-MSGID 9001 X-GM-THRID 7001 INTERNALDATE "08-Oct-2026 09:00:00 +0000")\r\nf0 OK fetched\r\n'
      }
      expect(args).not.toContain("--seen")
      return JSON.stringify({
        text_body: [1],
        html_body: [],
        attachments: [2],
        parts: [
          {
            headers: [
              { name: "subject", value: { Text: "Synthetic subject" } },
              { name: "from", value: { Address: { List: [{ address: "rin@example.test", name: "Rin Synthetic" }] } } },
            ],
            body: { Multipart: [1, 2] },
          },
          { headers: [], body: { Text: "Synthetic body" } },
          {
            headers: [
              {
                name: "content-type",
                value: {
                  ContentType: {
                    c_type: "text",
                    c_subtype: "csv",
                    attributes: [{ name: "name", value: "budget.csv" }],
                  },
                },
              },
            ],
            body: { Text: "name,value\nSynthetic,123\n" },
          },
        ],
      })
    }
    const input = {
      store,
      run,
      account: { name: "synthetic", address: key.account },
      since: new Date("2026-10-01T00:00:00Z"),
      now: () => Date.parse("2026-10-08T12:00:00Z"),
    }
    try {
      const first = await importMail(input)
      expect(first.attachments).toEqual([
        { message: "9001", part: 2, status: "extracted", locatorId: "9001:attachment:2" },
      ])
      expect(first.indexed?.chats).toBe(1)
      const locator = formatLocator({ ...key, chat: "7001", message: "9001:attachment:2" })
      const note = await store.knowledge.addAnnotation(key, { type: "message", locator }, "Own analysis")
      expect((await importMail(input)).deleted).toBe(0)
      expect((await store.message(key, "9001:attachment:2", { chatId: "7001" }))?.text).toContain("Synthetic,123")
      present = false
      expect((await importMail(input)).deleted).toBe(2)
      expect(await store.knowledge.annotation(key, note.id)).toMatchObject({
        targetState: "deleted",
        text: "Own analysis",
      })
    } finally {
      await store.close()
    }
  })
})
