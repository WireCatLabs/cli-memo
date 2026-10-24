#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { catchCrashes, processStreams } from "@wirecat/cli-base"
import { ensureSqlite } from "@wirecat/cli-core/sqlite-runtime"
import { type Command, CommanderError } from "commander"
import { APP } from "../app.js"
import { interactiveOf } from "../terminal.js"

// Compiling the program's module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
// A reader that stops early (`memo commands | head`) closes the pipe; the rest of the output has nowhere to go.
for (const stream of [process.stdout, process.stderr])
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error
  })
const args = process.argv.slice(2)
const tty = process.stdout.isTTY === true
const release = catchCrashes({ cli: APP.command, interactive: interactiveOf(args, tty), reasons: APP.errors.reasons })
let program: Command | undefined
try {
  await ensureSqlite()
  // A static import would load the store's SQLite before ensureSqlite could swap it.
  const { createProgram, refuseJoinedPath } = await import("../program.js")
  const { throwParseFailures } = await import("../failure.js")
  // `memo jobs status` says it in full; everywhere else one line, until a timer run passes again.
  if (args[0] !== "jobs") {
    const notice = (await import("../run/auto.js")).autoNotice(process.env)
    if (notice) processStreams.diagnostic(notice)
  }
  const { followInstall } = await import("../run/auto.js")
  const { updateNotice } = await import("../update.js")
  const notice = updateNotice(args)
  program = createProgram()
  const { readOnlyLockOf, setupAtStart } = await import("@wirecat/cli-core/cli")
  program.hook("preAction", (_root, command) => {
    const path: string[] = []
    for (let at: Command | null = command; at?.parent; at = at.parent) path.unshift(at.name())
    const given = command.optsWithGlobals()
    return setupAtStart({
      command: APP.command,
      env: process.env,
      path,
      headless: Boolean(given.json || given.jsonl || given.input === false || process.env.CI) || !tty,
      readOnlyLock: readOnlyLockOf(APP, process.env),
    })
  })
  throwParseFailures(program)
  refuseJoinedPath(program, args)
  await program.parseAsync(process.argv)
  // After the command, so a broken systemctl never stands between the owner and the answer.
  await followInstall(process.env).catch(() => undefined)
  const line = await notice
  if (line && !process.exitCode) processStreams.diagnostic(line)
} catch (error) {
  // Help and the version were printed already; only their exit code is left to give. A bare `memo` or group printed
  // help for a missing command: a usage mistake, exit 2, as in the tools built on cli-core's program.
  if (error instanceof CommanderError && (error.exitCode === 0 || error.code.startsWith("commander.help")))
    process.exitCode = error.code === "commander.help" && error.exitCode !== 0 ? 2 : error.exitCode
  else
    process.exitCode = (await import("../failure.js")).reportFailure(error, {
      args,
      program,
      streams: processStreams,
      tty,
    })
} finally {
  release()
}
