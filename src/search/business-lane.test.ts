import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"

it("leaves products and contracts out of search all until the business lane's permission key is mapped", async () => {
  const f = await businessStore("search-business")
  await f.item(OWNER, "products", "add", "Velocipede rental", "10000.00", "RUB", "--kind", "service")
  await f.item(OWNER, "contracts", "add", "Velocipede agreement", "--kind", "service")
  const hits = await f.items(OWNER, "search", "all", "Velocipede")
  expect(hits.filter((hit) => /^(product|contract):/.test(String(hit.ref)))).toEqual([])
})
