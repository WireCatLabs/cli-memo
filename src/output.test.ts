import { describe, expect, it } from "vitest"
import { answerOf, snakeKeys } from "./output.js"

describe("snakeKeys", () => {
  it("spells memo's keys snake_case at every depth and keeps the owner's own keys as written", () => {
    expect(
      snakeKeys({
        hasMore: true,
        items: [{ chatTitle: "Harbour", frontMatter: { reviewDate: "2026-01-01" } }],
        email: { headers: { "List-Id": "news", xMailer: "Example" }, metadata: { matchedRule: "skip" } },
        "Projects/Harbour.md": 1,
        at: new Date(0),
      }),
    ).toEqual({
      has_more: true,
      items: [{ chat_title: "Harbour", front_matter: { reviewDate: "2026-01-01" } }],
      email: { headers: { "List-Id": "news", xMailer: "Example" }, metadata: { matchedRule: "skip" } },
      "Projects/Harbour.md": 1,
      at: new Date(0),
    })
  })
})

describe("answerOf", () => {
  const meta = expect.objectContaining({ run_id: expect.any(String), complete: true })

  it("puts an array or a bare page in items, and anything else in item", () => {
    expect(answerOf([{ chatId: "1" }], Date.now())).toEqual({
      items: [{ chat_id: "1" }],
      page: { mode: "page", limit: 1, has_more: false },
      meta,
    })
    expect(answerOf({ items: [], hasMore: true }, Date.now())).toEqual({
      items: [],
      page: { mode: "page", limit: 1, has_more: true },
      meta,
    })
    expect(answerOf({ removed: 1, items: [] }, Date.now())).toEqual({ item: { removed: 1, items: [] }, meta })
  })
})
