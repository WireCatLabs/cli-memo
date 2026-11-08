import { expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

it("writes a product directly for anyone, finds it by kind and archives it", async () => {
  const f = await businessStore("products")
  const own = await f.item(
    OWNER,
    "products",
    "add",
    "Bike rental, month",
    "10000.00",
    "RUB",
    "--kind",
    "service",
    "--unit",
    "month",
  )
  expect(own).toMatchObject({ kind: "service", unit_price: "10000.00", currency: "RUB", unit: "month" })
  const agents = await f.item(AGENT, "products", "add", "Helmet", "--sku", "H-12", "--supplier", f.client)
  expect(agents).toMatchObject({ kind: "product", sku: "H-12", supplier: { ref: f.client } })

  expect((await f.items(OWNER, "products", "list", "kind:service")).map((one) => one.ref)).toEqual([own.ref])
  const changed = await f.item(
    OWNER,
    "products",
    "update",
    own.ref as string,
    "--amount",
    "12000.00",
    "--currency",
    "RUB",
    "--archived",
    "on",
  )
  expect(changed).toMatchObject({ unit_price: "12000.00", archived_date: expect.any(String) })
  expect((await f.items(OWNER, "products", "list", "archived:true")).map((one) => one.ref)).toEqual([own.ref])
  expect(await f.item(OWNER, "products", "show", own.ref as string)).toMatchObject({ name: "Bike rental, month" })
  await expect(f.run(OWNER, "products", "update", own.ref as string, "--archived", "maybe")).rejects.toMatchObject({
    code: "validation_error",
  })
})
