import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MailSource } from "@wirecat/cli-core/mail"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it, vi } from "vitest"
import { backfillHeaders } from "./backfill-headers.js"
import { repairHtmlText } from "./repair.js"
import { SLICE_SIZE } from "./slices.js"

const opened: MessageStore[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const store of opened.splice(0)) await store.close()
})

const ME = "owner@example.test"
const COUNT = SLICE_SIZE + 10

const seed = async (text: (n: number) => string) => {
  const dir = mkdtempSync(join(tmpdir(), "slices-"))
  const store = await openStore({ env: { ...process.env, MESSAGING_STORE: join(dir, "wirecat.db") } })
  opened.push(store)
  const accountId = await store.accounts.saveAccount({ provider: "email", account: ME }, { name: ME })
  for (let n = 1; n <= COUNT; n++) {
    await store.mail.saveThread({
      accountId,
      externalId: `t${n}`,
      now: 1,
      emails: [
        {
          externalId: `m${n}`,
          subject: `Synthetic ${n}`,
          from: { address: "deals@shop.example", name: "Shop" },
          to: [{ address: ME, name: null }],
          cc: [],
          sentAt: n * 1000,
          receivedAt: n * 1000,
          references: [],
          bodyText: text(n),
          outgoing: false,
          read: true,
          mailboxes: [{ externalId: "[Gmail]/All Mail", name: "[Gmail]/All Mail", kind: null }],
        },
      ],
    })
  }
  return { store, accountId }
}

const failSecondSave = (store: MessageStore) => {
  const original = store.mail.saveThreads.bind(store.mail)
  let calls = 0
  vi.spyOn(store.mail, "saveThreads").mockImplementation(async (inputs, states) => {
    if (++calls === 2) throw new Error("database is locked")
    return original(inputs, states)
  })
}

const source = {
  find: async (ids: readonly string[]) =>
    ids.map((messageId) => ({ messageId, headers: { to: [], bulk: false, replyTo: "desk@elsewhere.example" } })),
} as unknown as MailSource

it("backfill saves the cursor with each slice and resumes after the last saved one", async () => {
  const { store, accountId } = await seed((n) => `Body ${n}`)
  failSecondSave(store)
  const key = { provider: "email" as const, account: ME }

  await expect(backfillHeaders(store, source, ME)).rejects.toThrow("database is locked")
  const saved = JSON.parse((await store.sync.syncState(key, "mail_headers_backfill"))?.value ?? "{}")
  expect(saved).toEqual({ done: false, before: (COUNT - SLICE_SIZE + 1) * 1000 })
  const filledAfterFailure = (await store.mail.emailFacts({ accountId })).filter((e) => e.replyTo !== null)
  expect(filledAfterFailure).toHaveLength(SLICE_SIZE)

  expect(await backfillHeaders(store, source, ME)).toBe(COUNT - SLICE_SIZE)
  expect((await store.mail.emailFacts({ accountId })).every((e) => e.replyTo === "desk@elsewhere.example")).toBe(true)
})

it("repair keeps what a failed slice run converted and finishes the rest, marking done last", async () => {
  const { store, accountId } = await seed((n) => `<html><body><p>Hello ${n}</p></body></html>`)
  failSecondSave(store)
  const key = { provider: "email" as const, account: ME }

  await expect(repairHtmlText(store, ME)).rejects.toThrow("database is locked")
  expect((await store.sync.syncState(key, "mail_text_repair"))?.value).toBeUndefined()
  const stillHtml = async () =>
    (await store.mail.emails({ accountId })).filter((e) => e.bodyText?.includes("<html>")).length
  expect(await stillHtml()).toBe(COUNT - SLICE_SIZE)

  expect(await repairHtmlText(store, ME)).toBe(COUNT - SLICE_SIZE)
  expect(await stillHtml()).toBe(0)
  expect((await store.sync.syncState(key, "mail_text_repair"))?.value).toBe("html-text-1")
  expect(await repairHtmlText(store, ME)).toBeUndefined()
})
