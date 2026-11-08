import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

it("totals an order from its lines, copies a product's price once, and keeps an agent off the owner's order", async () => {
  const f = await businessStore("order-lines")
  const product = await f.item(OWNER, "products", "add", "Bike rental, month", "10000.00", "RUB", "--kind", "service")
  const order = await f.item(OWNER, "orders", "add", "Synthetic Rental", "1.00", "RUB", "--kind", "business")
  const ref = order.ref as string

  const one = await f.item(OWNER, "orders", "lines", "add", ref, "12", "--product", product.ref as string)
  expect(one).toMatchObject({
    total: "120000.00",
    currency: "RUB",
    lines: [{ position: 1, description: "Bike rental, month", unit_price: "10000.00", product: product.ref }],
  })
  await f.item(OWNER, "products", "update", product.ref as string, "--amount", "11000.00", "--currency", "RUB")
  const two = await f.item(OWNER, "orders", "lines", "add", ref, "2", "2500.00", "Helmet")
  expect(two).toMatchObject({ total: "125000.00", lines: [{ amount: "120000.00" }, { amount: "5000.00" }] })

  await expect(f.run(AGENT, "orders", "lines", "add", ref, "1", "100.00", "Bell")).rejects.toMatchObject({
    code: "permission_error",
  })
  expect(await f.item(OWNER, "orders", "lines", "remove", ref, "2")).toMatchObject({
    total: "120000.00",
    lines: [{ position: 1 }],
  })
})

it("lets an agent change the lines of an order it proposed", async () => {
  const f = await businessStore("order-lines-agent")
  const order = await f.item(
    AGENT,
    "orders",
    "add",
    "Office Supply",
    "1.00",
    "RUB",
    "--kind",
    "client",
    "--reason",
    "the shop says so",
  )
  const changed = await f.item(AGENT, "orders", "lines", "add", order.ref as string, "3", "100.00", "Paper")
  expect(changed).toMatchObject({ review: "proposed", total: "300.00" })
})
