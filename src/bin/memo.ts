#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { processStreams } from "@wirecat/cli-base"
import type { Command } from "commander"
import { APP } from "../app.js"
import { interactiveOf } from "../terminal.js"

// Compiling the program's module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
const { reportFailure, throwParseFailures } = await import("../failure.js")
const { startCli } = await import("@wirecat/cli-core/cli")

let program: Command | undefined
await startCli({
  app: APP,
  sqlite: true,
  interactive: interactiveOf,
  reasons: APP.errors.reasons,
  run: async (entry) => {
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
    program = createProgram()
    program.hook("preAction", (_root, command) => entry.atStart(command))
    throwParseFailures(program)
    refuseJoinedPath(program, entry.args)
    await program.parseAsync(process.argv)
    // After the command, so a broken systemctl never stands between the owner and the answer.
    await followInstall(entry.env).catch(() => undefined)
    const line = await notice
    if (line && !process.exitCode) processStreams.diagnostic(line)
    return undefined
  },
  fail: (error, entry) => reportFailure(error, { args: entry.args, program, streams: processStreams, tty: entry.tty }),
})
