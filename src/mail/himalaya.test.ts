import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { errorReport, himalaya, stderrTail } from "./himalaya.js"

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

  it("is not asked again after a failed login, nor when it is not installed", async () => {
    const env = {
      ...fake('echo "Error: cannot authenticate to IMAP server: authentication failed" >&2; exit 1'),
      MEMO_HIMALAYA_RETRY_MS: "60000",
    }

    const started = Date.now()
    await expect(himalaya(env)(["imap", "raw"])).rejects.toThrow("cannot authenticate")
    await expect(
      himalaya({ ...env, MEMO_HIMALAYA: join(tmpdir(), "no-such-himalaya") })(["imap", "raw"]),
    ).rejects.toMatchObject({
      message: "himalaya imap raw: himalaya is not installed or not on PATH",
    })
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it("is a throttled account when Gmail says so", async () => {
    const env = fake('echo "b NO [THROTTLED] Account exceeded command or bandwidth limits" >&2; exit 1')

    await expect(himalaya(env)(["imap", "raw"])).rejects.toMatchObject({
      code: "rate_limited",
      details: { reason: "mail.throttled" },
    })
  })
})

describe("himalaya's own error report", () => {
  it("is read from stdout, where himalaya 2.2 prints it, when stderr is empty", async () => {
    const env = fake(
      'printf "* OK Gimap ready\\nError: cannot connect to IMAP server\\n\\nSuggestions:\\n - Run with --log-level\\n"; exit 1',
    )

    await expect(himalaya(env)(["imap", "raw", "-a", "home"])).rejects.toMatchObject({
      message: "himalaya imap raw failed (exit 1): Error: cannot connect to IMAP server",
      details: { stderr_tail: ["Error: cannot connect to IMAP server"] },
    })
  })

  it("is a throttled account when the report says so", async () => {
    const env = fake('echo "Error: NO [THROTTLED] Account exceeded command or bandwidth limits"; exit 1')

    await expect(himalaya(env)(["imap", "raw"])).rejects.toMatchObject({ details: { reason: "mail.throttled" } })
  })

  it("leaves the IMAP answer above the report out", () => {
    expect(
      errorReport("* 1 FETCH (UID 7)\nError: connection reset\ncaused by: os error 104\n\nSuggestions:\n - x"),
    ).toEqual(["Error: connection reset", "caused by: os error 104"])
  })
})

describe("a read that fails once", () => {
  const flaky = () => {
    const mark = join(mkdtempSync(join(tmpdir(), "himalaya-")), "tried")
    return fake(`if [ -e ${mark} ]; then echo "a OK"; else touch ${mark}; echo "Error: connection reset"; exit 1; fi`)
  }

  it("is tried once more", async () => {
    await expect(himalaya(flaky())(["imap", "raw"], "a EXAMINE INBOX\r\n")).resolves.toBe("a OK\n")
  })

  it("is not repeated when it writes", async () => {
    await expect(himalaya(flaky())(["imap", "raw"], "a UID STORE 1 +FLAGS (\\Seen)\r\n")).rejects.toThrow(
      "connection reset",
    )
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
