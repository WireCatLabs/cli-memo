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

const stored = (count: number) => async (limit: number, offset: number) =>
  Array.from({ length: Math.max(0, Math.min(count - offset, limit)) }, (_, i) => offset + i)

it("pages from the clamped limit, and knows at the cap whether a next page holds anything", async () => {
  expect(await pageOf("facts list", 1000, stored(500), { page: 1 })).toMatchObject({
    page: { limit: 500, has_more: false },
  })
  expect(await pageOf("facts list", 1000, stored(501), { page: 1 })).toMatchObject({
    page: { has_more: true, next_page: 2 },
  })
  const second = await pageOf("facts list", 1000, stored(501), { page: 2 })
  expect(second).toMatchObject({ items: [500], page: { has_more: false } })
})

it("judges whether more remain on the rows read, before shaping drops any", async () => {
  const answer = await pageOf("actions list", 2, stored(5), { page: 1, shape: (rows) => rows.filter((n) => n > 9) })
  expect(answer).toMatchObject({ items: [], page: { has_more: true, next_page: 2 } })
})
