import { expect, it } from "vitest"
import { lowerSuspicious } from "./search.js"

it("moves suspicious items after the rest and keeps each part in its order", () => {
  const items = ["a", "fake1", "b", "fake2", "c"]
  expect(lowerSuspicious(items, (item) => item.startsWith("fake"))).toEqual(["a", "b", "c", "fake1", "fake2"])
})
