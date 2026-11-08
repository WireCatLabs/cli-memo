import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"

it("finds products and contracts in search all by the words of their names", async () => {
  const f = await businessStore("search-business")
  await f.item(OWNER, "products", "add", "Velocipede rental", "10000.00", "RUB", "--kind", "service")
  await f.item(OWNER, "contracts", "add", "Velocipede agreement", "--kind", "service")
  const hits = await f.items(OWNER, "search", "all", "Velocipede")
  const refs = hits.map((hit) => String(hit.ref)).filter((ref) => /^(product|contract):/.test(ref))
  expect(refs.map((ref) => ref.split(":")[0]).sort()).toEqual(["contract", "product"])
})
