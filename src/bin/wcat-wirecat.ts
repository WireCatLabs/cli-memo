#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { fileURLToPath } from "node:url"
import { wcatStart } from "@wirecat/cli-base/wcat/start"
import { DESKTOP } from "../identity.js"
import { mayMigrate } from "../migrate/check.js"

// Compiling the program's module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
const wcat = await wcatStart(DESKTOP)
if (wcat.code !== undefined) {
  process.exitCode = wcat.code
} else {
  // Before any command, a bare --version too: wcat's last upgrade runs that once to move wcat's files and timers.
  if (mayMigrate(process.env, process.platform, fileURLToPath(import.meta.url))) {
    try {
      const { migrateFromMemo } = await import("../migrate/from-memo.js")
      await migrateFromMemo({ env: process.env, warn: (line) => process.stderr.write(`${line}\n`) })
    } catch (error) {
      process.stderr.write(
        `wcat: moving wcat's files failed: ${error instanceof Error ? error.message : String(error)}; the next start tries again\n`,
      )
    }
  }
  const { startCli } = await import("@wirecat/cli-core/cli/start")
  const { memoEntry } = await import("../run/entry.js")
  await startCli(memoEntry())
}
