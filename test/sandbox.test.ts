import { homedir } from "node:os"
import { storePath } from "@wirecat/cli-messaging/store"
import { describe, expect, it } from "vitest"
import { configPath } from "../src/config.js"

describe("test sandbox", () => {
  const sandbox = process.env.MEMO_TEST_SANDBOX ?? ""

  it("keeps the shared message store inside the sandbox", () => {
    expect(sandbox).not.toBe("")
    expect(storePath().startsWith(sandbox)).toBe(true)
  })

  it("keeps memo's own config inside the sandbox", () => {
    expect(configPath().startsWith(sandbox)).toBe(true)
  })

  it("never reaches the real systemctl or Himalaya", () => {
    expect(process.env.MEMO_SYSTEMCTL?.startsWith(import.meta.dirname)).toBe(true)
    expect(process.env.MEMO_HIMALAYA?.startsWith(import.meta.dirname)).toBe(true)
  })

  it("keeps home and Himalaya's config inside the sandbox", () => {
    expect(homedir().startsWith(sandbox)).toBe(true)
    expect(process.env.HIMALAYA_CONFIG?.startsWith(sandbox)).toBe(true)
  })
})
