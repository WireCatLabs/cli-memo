import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

const message = (id: string, senderId: string, senderName: string): Message => ({
  id,
  chatId: `chat-${senderId}`,
  senderId,
  senderName,
  timestamp: "2026-09-10T08:00:00Z",
  editedAt: null,
  text: "synthetic",
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

let f: Awaited<ReturnType<typeof businessStore>>

beforeEach(async () => {
  f = await businessStore("bots")
  const store = await openStore({ env: f.env })
  const mail = { provider: "email", account: "owner@example.test" }
  await store.messages.saveMessages(mail, "t1", [message("m1", "alerts@shop.example", "Shop Alerts")], { via: "test" })
  await store.messages.saveMessages(mail, "t2", [message("m2", "rin@example.test", "Rin Example")], { via: "test" })
  await store.close()
})

// Addresses at reserved domains are test data, which only kind:test lists.
const peopleRefs = async () => (await f.items(OWNER, "people", "list", "kind:test")).map(({ ref }) => ref)

it("moves a sender to a bot and back with its whole history, as the owner only", async () => {
  const people = await peopleRefs()
  expect(await f.items(OWNER, "bots", "list")).toEqual([])
  await expect(f.item(AGENT, "bots", "move", "alerts@shop.example", "--kind", "bot")).rejects.toMatchObject({
    code: "permission_error",
  })

  const moved = await f.item(OWNER, "bots", "move", "Alerts@Shop.example", "--kind", "bot", "--name", "Shop")
  expect(moved).toMatchObject({ moved: "email:alerts@shop.example", kind: "bot", name: "Shop", history: "whole" })
  const bot = moved.ref as string
  expect(bot).toMatch(/^bot:\d+$/)

  const [listed] = await f.items(OWNER, "bots", "list", "name:shop")
  expect(listed).toMatchObject({
    ref: bot,
    name: "Shop",
    author: "owner",
    identities: [{ identity: "email:alerts@shop.example" }],
    messages_from: 1,
  })
  const during = await peopleRefs()
  expect(await f.items(OWNER, "bots", "list", "name:nobody")).toEqual([])

  const shown = await f.item(OWNER, "bots", "show", bot)
  expect(shown.moves).toEqual([
    expect.objectContaining({ identity: "email:alerts@shop.example", to: bot, author: "owner" }),
  ])

  const back = await f.item(OWNER, "bots", "move", bot, "--kind", "person")
  expect(back).toMatchObject({ moved: bot, kind: "person", ref: expect.stringMatching(/^person:\d+$/) })
  expect(await f.items(OWNER, "bots", "list")).toEqual([])
  expect(during).not.toContain(back.ref)
  expect(during).toHaveLength(people.length - 1)
  expect((await peopleRefs()).sort()).toEqual(people.sort())
})

it("says in its text that the whole history moved and how to move it back", async () => {
  const text = await f.text("bots", "move", "email:alerts@shop.example", "--kind", "bot")
  expect(text).toMatch(/^moved email:alerts@shop\.example to bot:\d+ .*whole history/)
  expect(text).toMatch(/wcat bots move bot:\d+ --kind person moves it back/)
})

it("refuses options that belong to the other direction and a reference it cannot read", async () => {
  await expect(
    f.item(OWNER, "bots", "move", "email:alerts@shop.example", "--kind", "person", "--name", "Shop"),
  ).rejects.toMatchObject({ code: "validation_error" })
  await expect(f.item(OWNER, "bots", "move", "person:me", "--kind", "bot")).rejects.toMatchObject({
    details: { reason: "person.no-owner" },
  })
  await expect(f.item(OWNER, "bots", "move", "Shop Alerts", "--kind", "bot")).rejects.toMatchObject({
    code: "validation_error",
    details: { reason: "identity.no-messenger" },
  })
})

it("does not run in an account group, whose counts it would overstate", async () => {
  await f.run(OWNER, "groups", "add", "work", "email:owner@example.test")
  await expect(f.run({ ...OWNER, WCAT_GROUP: "work" } as typeof OWNER, "bots", "list")).rejects.toMatchObject({
    details: { reason: "bots.whole-store" },
  })
})

it("joins a sender to a stored bot as the owner from the app, keeps the reason and pages the list", async () => {
  await expect(
    f.item(AGENT, "bots", "move", "email:rin@example.test", "--kind", "bot", "--as-owner"),
  ).rejects.toMatchObject({ details: { reason: "decision.owner-unconfirmed" } })
  const shop = (await f.item(AGENT, "bots", "move", "email:alerts@shop.example", "--kind", "bot", "--from-app"))
    .ref as string
  const joined = await f.item(
    OWNER,
    "bots",
    "move",
    "email:rin@example.test",
    "--kind",
    "bot",
    "--into",
    shop,
    "--reason",
    "the shop's second address",
  )
  expect(joined.ref).toBe(shop)
  const shown = await f.item(OWNER, "bots", "show", shop)
  expect(shown.identities).toHaveLength(2)
  expect(shown.moves).toContainEqual(
    expect.objectContaining({ identity: "email:rin@example.test", reason: "the shop's second address" }),
  )
  await expect(
    f.item(OWNER, "bots", "move", "email:rin@example.test", "--kind", "person", "--into", shop),
  ).rejects.toMatchObject({ code: "validation_error", details: { param: "into" } })

  expect(await f.items(OWNER, "bots", "list", "--limit", "1", "--page", "1")).toHaveLength(1)
  expect(await f.items(OWNER, "bots", "list", "--limit", "1", "--page", "2")).toEqual([])
})

it("mounts cli-core's domain-lists: an empty pack lists nothing and an offline update refuses", async () => {
  expect(await f.items(OWNER, "domain-lists", "list")).toEqual([])
  await expect(f.run(OWNER, "domain-lists", "update", "--commercial-only", "--offline")).rejects.toThrow("--offline")
})
