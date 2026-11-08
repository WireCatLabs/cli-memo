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
  const two = await f.item(OWNER, "orders", "lines", "add", ref, "2", "Helmet", "--amount", "2500.00")
  expect(two).toMatchObject({ total: "125000.00", lines: [{ amount: "120000.00" }, { amount: "5000.00" }] })

  await expect(f.run(AGENT, "orders", "lines", "add", ref, "1", "Bell", "--amount", "100.00")).rejects.toMatchObject({
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
  const changed = await f.item(AGENT, "orders", "lines", "add", order.ref as string, "3", "Paper", "--amount", "100.00")
  expect(changed).toMatchObject({ review: "proposed", total: "300.00" })
})

it("adds and removes an invoice's lines, and keeps an agent off the owner's invoice", async () => {
  const f = await businessStore("invoice-lines")
  const product = await f.item(OWNER, "products", "add", "Bike rental, month", "10000.00", "RUB", "--kind", "service")
  const invoice = await f.item(
    OWNER,
    ...["invoices", "add", "500.00", "RUB", "Delivery", "--kind", "receivable", "--organization", f.client],
  )
  const ref = invoice.ref as string

  const two = await f.item(OWNER, "invoices", "lines", "add", ref, "2", "--product", product.ref as string)
  expect(two).toMatchObject({
    total: "20500.00",
    lines: [
      { position: 1, amount: "500.00" },
      { position: 2, unit_price: "10000.00", product: product.ref },
    ],
  })
  await expect(f.run(AGENT, "invoices", "lines", "add", ref, "1", "Bell", "--amount", "100.00")).rejects.toMatchObject({
    code: "permission_error",
  })
  expect(await f.item(OWNER, "invoices", "lines", "remove", ref, "1")).toMatchObject({
    total: "20000.00",
    lines: [{ position: 2 }],
  })
  await expect(f.run(OWNER, "invoices", "lines", "remove", ref, "2")).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("takes a line's price from --amount over its product's, and needs --amount without a product", async () => {
  const f = await businessStore("lines-amount")
  const product = await f.item(OWNER, "products", "add", "Bike rental, month", "10000.00", "RUB", "--kind", "service")
  const ref = (await f.item(OWNER, "orders", "add", "Synthetic Rental", "1.00", "RUB", "--kind", "business"))
    .ref as string
  const priced = await f.item(
    OWNER,
    ...["orders", "lines", "add", ref, "1", "First", "week", "--product", product.ref as string, "--amount", "2000.00"],
  )
  expect(priced).toMatchObject({
    lines: [{ description: "First week", unit_price: "2000.00", product: product.ref }],
  })
  await expect(f.run(OWNER, "orders", "lines", "add", ref, "1", "Bell")).rejects.toMatchObject({
    code: "validation_error",
    details: { param: "--amount" },
  })
})

it("lists an order's and an invoice's lines in their text", async () => {
  const f = await businessStore("lines-text")
  const order = (await f.item(OWNER, "orders", "add", "Shop One", "1.00", "RUB", "--kind", "business")).ref as string
  await f.run(OWNER, "orders", "lines", "add", order, "2", "Bell", "--amount", "100.00")
  expect(await f.text("orders", "show", order)).toMatch(/# lines: 1\n1 · 2 · 100\.00 · 200\.00 · Bell/)
  const invoice = (
    await f.item(
      OWNER,
      "invoices",
      "add",
      "500.00",
      "RUB",
      "Delivery",
      "--kind",
      "receivable",
      "--organization",
      f.client,
    )
  ).ref as string
  expect(await f.text("invoices", "show", invoice)).toMatch(/# lines: 1\n1 · 1 · .*500\.00 · Delivery/)
})
