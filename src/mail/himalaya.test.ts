import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { himalaya, stderrTail } from "./himalaya.js"

const fake = (script: string): NodeJS.ProcessEnv => {
  const path = join(mkdtempSync(join(tmpdir(), "himalaya-")), "himalaya")
  writeFileSync(path, `#!/bin/sh\n${script}\n`)
  chmodSync(path, 0o755)
  return { ...process.env, MEMO_HIMALAYA: path }
}

describe("a failing himalaya", () => {
  it("names how it ended and keeps the last lines it printed", async () => {
    const env = fake('echo "connecting" >&2; echo "imap: connection reset by peer" >&2; exit 3')

    await expect(himalaya(env)(["imap", "raw", "-a", "home"])).rejects.toMatchObject({
      code: "provider_error",
      message: "himalaya imap raw failed (exit 3): imap: connection reset by peer",
      details: {
        reason: "mail.source-failed",
        exit_code: 3,
        stderr_tail: ["connecting", "imap: connection reset by peer"],
      },
    })
  })

  it("says it printed nothing rather than repeating the command", async () => {
    await expect(himalaya(fake("exit 1"))(["imap", "raw"])).rejects.toThrow(
      "himalaya imap raw failed (exit 1): no error text",
    )
  })

  it("is a throttled account when Gmail says so", async () => {
    const env = fake('echo "b NO [THROTTLED] Account exceeded command or bandwidth limits" >&2; exit 1')

    await expect(himalaya(env)(["imap", "raw"])).rejects.toMatchObject({
      code: "rate_limited",
      details: { reason: "mail.throttled" },
    })
  })
})

describe("stderrTail", () => {
  it("leaves a password or token out of the lines it keeps", () => {
    expect(stderrTail("login failed: password=hunter2\nGET https://user:secret@imap.example/ token abc123")).toEqual([
      "login failed: password=…",
      "GET https://…@imap.example/ token …",
    ])
  })
})
