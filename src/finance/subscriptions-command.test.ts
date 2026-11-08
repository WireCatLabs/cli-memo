import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

it("confirms the owner's subscription, keeps every price, and makes an agent's new price a proposal of its own", async () => {
  const f = await businessStore("subscriptions")
  const own = await f.item(
    OWNER,
    ...["subscriptions", "add", "Hosting", "990.00", "RUB", "--kind", "payable", "--supplier", f.client],
    ...["--every", "1-month", "--start-date", "2026-01-01"],
  )
  expect(own).toMatchObject({
    review: "confirmed",
    direction: "payable",
    supplier: { ref: f.client },
    customer: { owner: true },
    interval: { count: 1, unit: "month" },
    current_price: { amount: "990.00" },
  })
  const ref = own.ref as string

  const price = await f.item(
    AGENT,
    ...["subscriptions", "prices", "add", ref, "1190.00", "RUB", "--start-date", "2026-02-01"],
    ...["--reason", "the new tariff mail"],
  )
  expect(price).toMatchObject({ review: "proposed", amount: "1190.00", effective_from: "2026-02-01" })
  expect((await f.items(OWNER, "review", "list", "kind:subscription_price")).map((one) => one.id)).toEqual([price.ref])
  expect(await f.item(OWNER, "subscriptions", "show", ref)).toMatchObject({
    review: "confirmed",
    current_price: { amount: "990.00" },
    prices: [{ amount: "990.00" }, { amount: "1190.00", review: "proposed" }],
  })

  expect(await f.item(OWNER, "subscriptions", "update", ref, "--status", "paused")).toMatchObject({ status: "paused" })
  expect((await f.items(OWNER, "subscriptions", "list", "status:paused")).map((one) => one.ref)).toEqual([ref])
  const cancelled = await f.item(OWNER, "subscriptions", "cancel", ref, "--occurred-time", "2026-03-01")
  expect(cancelled).toMatchObject({ status: "cancelled", cancelled_date: "2026-03-01" })
})

it("keeps an agent's subscription for review and refuses one with no schedule", async () => {
  const f = await businessStore("subscriptions-agent")
  const proposed = await f.item(
    AGENT,
    ...["subscriptions", "add", "Bike rental", "10000.00", "RUB", "--kind", "receivable", "--customer", f.client],
    ...["--every", "1-month", "--start-date", "2026-11-01", "--trial-end-date", "2026-11-14", "--status", "trial"],
  )
  expect(proposed).toMatchObject({ review: "proposed", status: "trial", supplier: { owner: true } })
  expect((await f.items(OWNER, "review", "list", "kind:subscription")).map((one) => one.id)).toEqual([proposed.ref])
  await expect(
    f.run(OWNER, "subscriptions", "add", "Hosting", "990.00", "RUB", "--kind", "payable", "--supplier", f.client),
  ).rejects.toMatchObject({ code: "validation_error" })
})
