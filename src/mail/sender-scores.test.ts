import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { SCORE_VERSION, scoreSenders } from "./sender-scores.js"

const opened: MessageStore[] = []
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close()
})

const ME = "owner@example.test"
const DAY = 86_400_000

const mail = (n: number, from: string, name: string, more: Record<string, unknown> = {}) => ({
  externalId: `<${n}@example.test>`,
  subject: `Synthetic ${n}`,
  from: { address: from, name },
  to: [{ address: ME, name: null }],
  cc: [],
  sentAt: 1_000 + n,
  receivedAt: 1_000 + n,
  references: [],
  bodyText: `Synthetic body ${n}`,
  outgoing: false,
  read: true,
  mailboxes: [],
  ...more,
})

it("scores each sender from the stored mail at most once a day", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "scores-")), "wirecat.db") }
  const store = await openStore({ env })
  opened.push(store)
  const accountId = await store.accounts.saveAccount({ provider: "email", account: ME }, { name: ME })
  await store.mail.saveThread({
    accountId,
    externalId: "t1",
    now: 1,
    emails: [
      mail(1, "alerts@pay-secure.example", "PayPal Support", { headers: { dkim: "fail", dmarc: "fail" } }),
      mail(2, "friend@people.example", "Friend Example"),
    ],
  })
  const now = Date.parse("2026-10-17T00:00:00Z")

  expect(await scoreSenders(store, ME, env, now)).toBe(2)
  expect(await scoreSenders(store, ME, env, now + DAY / 2)).toBeUndefined()

  const state = await store.sync.syncState({ provider: "email", account: ME }, "mail_sender_scores")
  expect(JSON.parse(state?.value ?? "{}")).toEqual({ version: SCORE_VERSION, at: now })
  expect(await scoreSenders(store, ME, env, now + DAY)).toBe(2)
})
