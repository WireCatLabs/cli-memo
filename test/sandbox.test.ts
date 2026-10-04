import { homedir } from "node:os"
import { storePath } from "@leemour/cli-messaging/store"
import { describe, expect, it } from "vitest"

describe("test sandbox", () => {
  const sandbox = process.env.MEMO_TEST_SANDBOX ?? ""

  it("keeps the shared message store inside the sandbox", () => {
    expect(sandbox).not.toBe("")
    expect(storePath().startsWith(sandbox)).toBe(true)
  })

  it("keeps home and Himalaya's config inside the sandbox", () => {
    expect(homedir().startsWith(sandbox)).toBe(true)
    expect(process.env.HIMALAYA_CONFIG?.startsWith(sandbox)).toBe(true)
  })
})
