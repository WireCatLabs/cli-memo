import { expect, it } from "vitest"
import { pageOf } from "./page.js"

const rows = (count: number) => async (limit: number) => Array.from({ length: Math.min(count, limit) }, (_, i) => i)

it("asks one row more than wanted, and says there are more only when it came back", async () => {
  expect(await pageOf(2, rows(3))).toEqual({ items: [0, 1], hasMore: true })
  expect(await pageOf(3, rows(3))).toEqual({ items: [0, 1, 2], hasMore: false })
})

it("says a full answer at the store's cap may have more", async () => {
  expect(await pageOf(500, rows(500))).toEqual({ items: Array.from({ length: 500 }, (_, i) => i), hasMore: true })
  expect(await pageOf(undefined, rows(5), { fallback: 20, cap: 200 })).toMatchObject({ hasMore: false })
})
