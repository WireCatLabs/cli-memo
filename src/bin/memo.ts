#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { errorObjectOf, exitCodeOfError, processStreams, renderError } from "@wirecat/cli-base"
import type { Command } from "commander"
import { APP } from "../app.js"
import { interactiveOf } from "../terminal.js"

// Compiling the program's module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
const { startCli } = await import("@wirecat/cli-core/cli/start")

let program: Command | undefined
let failure: typeof import("../failure.js") | undefined
await startCli({
  app: APP,
  sqlite: true,
  interactive: interactiveOf,
  reasons: APP.errors.reasons,
  run: async (entry) => {
    // failure.js loads cli-core's whole command tree, which a bare --version never needs.
    failure = await import("../failure.js")
    // A static import would load the store's SQLite before startCli could swap it.
    const { createProgram, refuseJoinedPath } = await import("../program.js")
    const { autoNotice, followInstall } = await import("../run/auto.js")
    // `memo jobs status` says it in full; everywhere else one line, until a timer run passes again.
    if (entry.args[0] !== "jobs") {
      const notice = autoNotice(entry.env)
      if (notice) processStreams.diagnostic(notice)
    }
    const { updateNotice } = await import("../update.js")
    const notice = updateNotice(entry.args)
    program = createProgram({ signal: entry.signal })
    program.hook("preAction", (_root, command) => entry.atStart(command))
    failure.throwParseFailures(program)
    refuseJoinedPath(program, entry.args)
    await program.parseAsync(process.argv)
    // After the command, so a broken systemctl never stands between the owner and the answer.
    await followInstall(entry.env).catch(() => undefined)
    const line = await notice
    if (line && !process.exitCode) processStreams.diagnostic(line)
    return undefined
  },
  fail: (error, entry) => {
    if (failure)
      return failure.reportFailure(error, { args: entry.args, program, streams: processStreams, tty: entry.tty })
    // Before run loaded failure.js: the SQLite swap, or the import itself.
    const object = errorObjectOf(error)
    processStreams.diagnostic(
      renderError(object, { cli: APP.command, interactive: interactiveOf(entry.args, entry.tty) }),
    )
    return exitCodeOfError(object)
  },
})
