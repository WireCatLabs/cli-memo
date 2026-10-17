import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { backfillHeaders } from "./backfill-headers.js"
import { himalaya } from "./himalaya.js"
import { himalayaSource } from "./source.js"

const opened: MessageStore[] = []
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close()
})

const ME = "owner@example.test"

it("reads the headers of mail stored without them, once, and keeps the text", async () => {
  const dir = mkdtempSync(join(tmpdir(), "backfill-"))
  const mailbox = join(dir, "mailbox.json")
  writeFileSync(
    mailbox,
    JSON.stringify({
      messages: [
        {
          uid: "101",
          messageId: "9001",
          threadId: "9001",
          receivedAt: "2025-03-01T08:00:00Z",
          subject: "Synthetic offer",
          from: ["Shop Deals", "deals@shop.example"],
          to: [[null, ME]],
          text: "Synthetic body",
          extraHeaders: [
            "Reply-To: desk@elsewhere.example",
            "Authentication-Results: mx.google.com; spf=pass; dkim=fail; dmarc=fail",
          ],
        },
      ],
    }),
  )
  const env = { ...process.env, MEMO_FAKE_MAILBOX: mailbox, MESSAGING_STORE: join(dir, "wirecat.db") }
  const store = await openStore({ env })
  opened.push(store)
  const accountId = await store.accounts.saveAccount({ provider: "email", account: ME }, { name: ME })
  await store.mail.saveThread({
    accountId,
    externalId: "9001",
    now: 1,
    emails: [
      {
        externalId: "9001",
        subject: "Synthetic offer",
        from: { address: "deals@shop.example", name: "Shop Deals" },
        to: [{ address: ME, name: null }],
        cc: [],
        sentAt: Date.parse("2025-03-01T08:00:00Z"),
        receivedAt: Date.parse("2025-03-01T08:00:00Z"),
        references: [],
        bodyText: "Synthetic body",
        outgoing: false,
        read: true,
        mailboxes: [{ externalId: "[Gmail]/All Mail", name: "[Gmail]/All Mail", kind: null }],
      },
    ],
  })
  const source = himalayaSource(himalaya(env), { name: "test" })

  expect(await backfillHeaders(store, source, ME)).toBe(1)
  const [facts] = await store.mail.emailFacts({ accountId })
  expect(facts).toMatchObject({ replyTo: "desk@elsewhere.example", dkim: "fail", dmarc: "fail" })
  expect((await store.mail.email(accountId, "9001"))?.bodyText).toBe("Synthetic body")

  expect(await backfillHeaders(store, source, ME)).toBeUndefined()
})
