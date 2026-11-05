import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

describe("a config that still has memo's old mail settings", () => {
  it("syncs no mail, says so, and points at the mail CLI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retired-mail-"))
    mkdirSync(join(dir, "config"))
    writeFileSync(
      join(dir, "config", "config.json"),
      JSON.stringify({ mail: { accounts: [{ name: "test", address: "owner@example.test", import: false }] } }),
    )
    const env = {
      ...process.env,
      MESSAGING_STORE: join(dir, "messages.db"),
      MEMO_CONFIG_DIR: join(dir, "config"),
      MEMO_STATE_DIR: join(dir, "state"),
    }
    const streams = captureStreams()

    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync(["sync", "--only", "mail", "--no-embed", "--timeout", "1m", "--json"], { from: "user" })

    expect(JSON.parse(streams.stdout.join("")).item).toMatchObject({ notes: [], failed: [] })
    expect(streams.stderr.join("")).toContain("memo sync no longer imports mail")
    expect(streams.stderr.join("")).toContain("memo config unset mail")
  })
})
