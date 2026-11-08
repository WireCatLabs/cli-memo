import { expect, it } from "vitest"
import { errorObject } from "../failure.js"
import { failureReason } from "./import.js"

it("keeps the first line of an unexpected error, and only the message of a known one", async () => {
  const crash = new TypeError("fetch failed\nat connect (net.js:1)")
  const { error: crashed } = await errorObject(crash)
  expect(failureReason(crash, crashed, false)).toBe("the command failed; this is a bug (TypeError: fetch failed)")

  const known = { reason: "mail.source-failed", message: "Gmail is limiting this account" }
  expect(failureReason(new Error("raw"), known, false)).toBe("Gmail is limiting this account")
})

it("names a damaged store and its recovery, not a bug", async () => {
  const malformed = Object.assign(new Error("database disk image is malformed"), {
    code: "ERR_SQLITE_ERROR",
    errcode: 11,
  })
  const { error: failure } = await errorObject(malformed)
  expect(failure).toMatchObject({ code: "configuration_error", reason: "store.damaged" })
  expect(failureReason(malformed, failure, false)).toContain("memo store recover")
})
