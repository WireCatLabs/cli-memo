import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

it("books a transaction, links it to its payment and splits it into categories", async () => {
  const f = await businessStore("transactions")
  const wallet = (await f.item(OWNER, "wallets", "add", "Main account", "RUB")).ref as string
  const pending = await f.item(
    OWNER,
    ...["transactions", "add", wallet, "10000.00", "--kind", "in", "--occurred-time", "2026-11-05"],
    ...["--description", "Аренда, ноябрь", "--status", "pending"],
  )
  expect(pending).toMatchObject({ review: "confirmed", status: "pending", wallet, description: "Аренда, ноябрь" })
  const ref = pending.ref as string

  const payment = await f.item(OWNER, "payments", "add", "10000.00", "RUB", "--kind", "in", "--organization", f.client)
  const booked = await f.item(
    OWNER,
    ...["transactions", "update", ref, "--status", "booked", "--payment", payment.ref as string],
  )
  expect(booked).toMatchObject({ status: "booked", payment: payment.ref, booked_date: "2026-11-05" })

  await f.run(OWNER, "transactions", "splits", "add", ref, "7000.00", "Rent", "--project", "SYR")
  const split = await f.item(OWNER, "transactions", "splits", "add", ref, "1000.00", "Bike", "repair")
  expect(split).toMatchObject({
    splits: [
      { position: 1, category: "Rent" },
      { position: 2, category: "Bike repair" },
    ],
    uncategorized: "2000.00",
  })
  expect((await f.items(OWNER, "transactions", "list", "category:Rent")).map((one) => one.ref)).toEqual([ref])
  expect((await f.items(OWNER, "transactions", "list", "uncategorized:true")).map((one) => one.ref)).toEqual([ref])
  expect(await f.item(OWNER, "transactions", "splits", "remove", ref, "2")).toMatchObject({ uncategorized: "3000.00" })
  expect(await f.item(OWNER, "transactions", "show", ref)).toMatchObject({ splits: [{ category: "Rent" }] })
})

it("keeps an agent's transaction as a proposal, and lets it split only its own", async () => {
  const f = await businessStore("transactions-agent")
  const wallet = (await f.item(OWNER, "wallets", "add", "Main account", "RUB")).ref as string
  const own = (await f.item(OWNER, "transactions", "add", wallet, "500.00", "--kind", "out")).ref as string
  const proposed = await f.item(
    AGENT,
    "transactions",
    "add",
    wallet,
    "300.00",
    "--kind",
    "out",
    "--reason",
    "statement",
  )
  expect(proposed).toMatchObject({ review: "proposed", reason: "statement" })
  expect((await f.items(OWNER, "review", "list", "kind:transaction")).map((one) => one.id)).toEqual([proposed.ref])

  await f.run(AGENT, "transactions", "splits", "add", proposed.ref as string, "300.00", "Coffee")
  await expect(f.run(AGENT, "transactions", "splits", "add", own, "100.00", "Coffee")).rejects.toMatchObject({
    code: "permission_error",
  })
  expect((await f.items(OWNER, "transactions", "list", "review:proposed")).map((one) => one.ref)).toEqual([
    proposed.ref,
  ])
})
