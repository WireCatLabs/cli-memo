import { describe, expect, it } from "vitest"
import { snakeKeys } from "./output.js"

describe("snakeKeys", () => {
  it("spells memo's keys snake_case at every depth and keeps the owner's own keys as written", () => {
    expect(
      snakeKeys({
        hasMore: true,
        items: [{ chatTitle: "Harbour", frontMatter: { reviewDate: "2026-01-01" } }],
        email: { headers: { "List-Id": "news", xMailer: "Example" }, metadata: { matchedRule: "skip" } },
        at: new Date(0),
      }),
    ).toEqual({
      has_more: true,
      items: [{ chat_title: "Harbour", front_matter: { reviewDate: "2026-01-01" } }],
      email: { headers: { "List-Id": "news", xMailer: "Example" }, metadata: { matchedRule: "skip" } },
      at: new Date(0),
    })
  })
})
