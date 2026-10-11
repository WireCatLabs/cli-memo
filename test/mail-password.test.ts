import { execFile } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { expect, it } from "vitest"

it("bin/mail-password refuses to run without an account and lists the configured ones", async () => {
  const config = mkdtempSync(join(tmpdir(), "mail-password-"))
  writeFileSync(
    join(config, "config.json"),
    JSON.stringify({
      mail: {
        accounts: [
          { name: "work", address: "alice@example.com" },
          { name: "home", address: "bob@example.com" },
        ],
      },
    }),
  )

  const run = promisify(execFile)(join(import.meta.dirname, "..", "bin", "mail-password"), [], {
    env: { ...process.env, MEMO_CONFIG_DIR: config },
  })

  await expect(run).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining("work, home") })
})
