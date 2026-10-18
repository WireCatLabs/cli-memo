import { expect, it } from "vitest"
import { plainText } from "./answer.js"

const meta = { run_id: "r", duration_ms: 1, complete: true }

it("prints a list as one line per record and an item as field lines, never JSON", () => {
  const list = {
    items: [
      { id: "1", key: "SYN", name: "Synthetic", created_at: "2026-10-18" },
      { id: "2", note: null },
    ],
    page: { mode: "page" as const, limit: 2, has_more: true },
    meta,
  }
  expect(plainText(list)).toBe("SYN  Synthetic\n2\nmore: raise --limit")

  const item = {
    item: { task: { key: "REQ-1", title: "Send\nit", tags: ["a", "b"], links: [{ to: "x" }] }, created: true },
    meta,
  }
  expect(plainText(item)).toBe(
    "task:\n  key: REQ-1\n  title: Send it\n  tags: a, b\n  links: 1 — --json shows them\ncreated: true",
  )
})
