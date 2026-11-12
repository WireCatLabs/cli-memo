import { expect, it } from "vitest"
import { pageOf } from "./page.js"

const stored = (count: number) => async (limit: number, offset: number) => ({
  items: Array.from({ length: Math.max(0, Math.min(count - offset, limit)) }, (_, i) => offset + i),
  hasMore: offset + limit < count,
})

it("answers the store's page and whether more remain", async () => {
  expect(await pageOf("facts list", 2, stored(3))).toEqual({
    items: [0, 1],
    page: { mode: "page", limit: 2, has_more: true },
  })
  expect(await pageOf("facts list", 3, stored(3))).toMatchObject({ items: [0, 1, 2], page: { has_more: false } })
  expect(await pageOf("facts list", undefined, stored(5), { fallback: 20, cap: 200 })).toMatchObject({
    page: { limit: 20, has_more: false },
  })
})

it("pages from the clamped limit", async () => {
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
