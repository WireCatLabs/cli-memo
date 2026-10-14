#!/usr/bin/env node
import { catchCrashes, processStreams } from "@wirecat/cli-base"
import { migrateFolders } from "@wirecat/cli-core/background"
import { ensureSqlite } from "@wirecat/cli-core/sqlite-runtime"
import { type Command, CommanderError } from "commander"
import { APP } from "../app.js"
import { interactiveOf, reportFailure, throwParseFailures } from "../failure.js"

const args = process.argv.slice(2)
const tty = process.stdout.isTTY === true
const release = catchCrashes({ cli: APP.command, interactive: interactiveOf(args, tty), reasons: APP.errors.reasons })
let program: Command | undefined
try {
  // Before anything resolves a path: a write into a new folder first would strand the old one.
  migrateFolders(APP)
  await ensureSqlite()
  // A static import would load the store's SQLite before ensureSqlite could swap it.
  const { createProgram, refuseJoinedPath } = await import("../program.js")
  // `memo auto status` says it in full; everywhere else one line, until a timer run passes again.
  if (args[0] !== "auto") {
    const notice = (await import("../run/auto.js")).autoNotice(process.env)
    if (notice) processStreams.diagnostic(notice)
  }
  program = createProgram()
  throwParseFailures(program)
  refuseJoinedPath(program, args)
  await program.parseAsync(process.argv)
} catch (error) {
  // Help and the version were printed already; only their exit code is left to give.
  if (error instanceof CommanderError && (error.exitCode === 0 || error.code.startsWith("commander.help")))
    process.exitCode = error.exitCode
  else process.exitCode = await reportFailure(error, { args, program, streams: processStreams, tty })
} finally {
  release()
}
