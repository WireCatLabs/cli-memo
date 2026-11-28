import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"

const ME = "owner@home.example.com"
const NOW = Date.parse("2026-11-20T12:00:00Z")

let f: Awaited<ReturnType<typeof businessStore>>

const email = (n: number, from: string, name: string, headers: Record<string, string | boolean> = {}) => ({
  externalId: `<m${n}@subscriptions.example.com>`,
  subject: `Issue ${n}`,
  from: { address: from, name },
  to: [{ address: ME, name: null }],
  sentAt: NOW - n * 86_400_000,
  receivedAt: NOW - n * 86_400_000,
  bodyText: null,
  headers,
})

beforeEach(async () => {
  f = await businessStore("mail-subscriptions")
  const store = await openStore({ env: f.env })
  const accountId = await store.accounts.saveAccount({ provider: "email", account: ME }, { name: null })
  const list = { "list-id": "weekly.paper.example.com", "list-unsubscribe": true }
  await store.mail.saveThreads([
    {
      accountId,
      externalId: "t1",
      now: NOW,
      emails: [
        email(1, "news@paper.example.com", "Weekly News", {
          ...list,
          "list-unsubscribe-https": "https://paper.example.com/u/1",
          "list-unsubscribe-post": true,
        }),
        email(2, "news@paper.example.com", "Weekly News", list),
        email(3, "news@paper.example.com", "Weekly News", { "list-id": "daily.paper.example.com" }),
      ],
    },
  ])
  await store.people.savePeople({ provider: "telegram", account: "1" }, [{ id: "50", name: "Helper", isBot: true }])
  await store.close()
})

it("lists broadcast mail by list, newest first, with where to unsubscribe", async () => {
  const items = await f.items(OWNER, "mail", "subscriptions", "list")

  expect(items).toMatchObject([
    {
      key: "list:weekly.paper.example.com",
      list_id: "weekly.paper.example.com",
      name: "Weekly News",
      emails: 2,
      newest: { subject: "Issue 1", at: new Date(NOW - 86_400_000).toISOString() },
      can_unsubscribe: true,
      unsubscribe: { https: "https://paper.example.com/u/1", mailto: null, one_click: true },
    },
    { key: "list:daily.paper.example.com", emails: 1, can_unsubscribe: false, unsubscribe: null },
  ])
  const second = await f.run(OWNER, "mail", "subscriptions", "list", "--limit", "1", "--page", "2")
  expect(second).toMatchObject({ items: [{ key: "list:daily.paper.example.com" }], page: { total: { value: 2 } } })
  expect(await f.items(OWNER, "mail", "subscriptions", "list", "type:promotion")).toEqual([])
})

it("reads only the mailboxes --source names", async () => {
  const mine = await f.items(OWNER, "mail", "subscriptions", "list", "--source", `email:${ME}`)
  expect(mine).toHaveLength(2)
  await expect(
    f.items(OWNER, "mail", "subscriptions", "list", "--source", "email:other@home.example.com"),
  ).rejects.toMatchObject({ code: "not_found" })
})

it("filters bots by what they send", async () => {
  await f.items(OWNER, "people", "list")
  expect((await f.items(OWNER, "bots", "list", "type:messenger")).map(({ name }) => name ?? null)).toHaveLength(1)
  expect(await f.items(OWNER, "bots", "list", "type:receipts")).toEqual([])
  await expect(f.items(OWNER, "bots", "list", "type:spam")).rejects.toMatchObject({ code: "validation_error" })
})
