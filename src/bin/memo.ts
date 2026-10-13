#!/usr/bin/env node
import { exitCodeFor, GENERIC_FAILURE, isCliError } from "@wirecat/cli-base"
import { migrateFolders } from "@wirecat/cli-messaging/background"
import { ensureSqlite } from "@wirecat/cli-messaging/sqlite-runtime"
import { APP } from "../app.js"

// Before anything resolves a path: a write into a new folder first would strand the old one.
migrateFolders(APP)
await ensureSqlite()
// A static import would load the store's SQLite before ensureSqlite could swap it.
const { createProgram, refuseJoinedPath } = await import("../program.js")
try {
  const program = createProgram()
  refuseJoinedPath(program, process.argv.slice(2))
  await program.parseAsync(process.argv)
} catch (error) {
  process.stderr.write(`memo: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = isCliError(error) ? exitCodeFor(error.code) : GENERIC_FAILURE
}
