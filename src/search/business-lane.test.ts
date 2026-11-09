import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"

it("finds the owner's products and contracts in search all, and in --only business alone", async () => {
  const f = await businessStore("search-business")
  const product = await f.item(OWNER, "products", "add", "Velocipede rental", "10000.00", "RUB", "--kind", "service")
  const contract = await f.item(OWNER, "contracts", "add", "Velocipede agreement", "--kind", "service")
  const refs = [product.ref, contract.ref]
  const everywhere = await f.items(OWNER, "search", "all", "Velocipede")
  expect(everywhere.map((hit) => hit.ref)).toEqual(expect.arrayContaining(refs))
  const only = await f.items(OWNER, "search", "all", "Velocipede", "--only", "business")
  expect(only.map((hit) => hit.ref).sort()).toEqual(refs.sort())
  expect(only.every((hit) => hit.provider === "business" && hit.account === "internal")).toBe(true)
})
