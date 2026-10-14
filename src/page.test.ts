import { expect, it } from "vitest"
import { pageOf } from "./page.js"

const rows = (count: number) => async (limit: number) => Array.from({ length: Math.min(count, limit) }, (_, i) => i)

it("asks one row more than wanted, and says there are more only when it came back", async () => {
  expect(await pageOf("facts list", 2, rows(3))).toEqual({
    items: [0, 1],
    page: { mode: "page", limit: 2, has_more: true },
  })
  expect(await pageOf("facts list", 3, rows(3))).toMatchObject({ items: [0, 1, 2], page: { has_more: false } })
})

it("says a full answer at the store's cap may have more", async () => {
  expect(await pageOf("facts list", 500, rows(500))).toMatchObject({ page: { has_more: true } })
  expect(await pageOf("facts list", undefined, rows(5), { fallback: 20, cap: 200 })).toMatchObject({
    page: { has_more: false },
  })
})
