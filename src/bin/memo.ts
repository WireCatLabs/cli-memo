#!/usr/bin/env node
import { exitCodeFor, GENERIC_FAILURE, isCliError } from "@leemour/cli-core"
import { ensureSqlite } from "@leemour/cli-messaging/sqlite-runtime"

await ensureSqlite()
// A static import would load the store's SQLite before ensureSqlite could swap it.
const { createProgram } = await import("../program.js")
try {
  await createProgram().parseAsync(process.argv)
} catch (error) {
  process.stderr.write(`memo: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = isCliError(error) ? exitCodeFor(error.code) : GENERIC_FAILURE
}
