import { errorObjectOf, exitCodeOfError, processStreams, renderError } from "@wirecat/cli-base"
import type { CliEntry, EntryContext } from "@wirecat/cli-core/cli/start"
import type { Command } from "commander"
import { APP } from "../app.js"
import { interactiveOf } from "../terminal.js"

/**
 * memo as `startCli` runs it. Under `commands --serve` several requests run at once, so each keeps its own program:
 * commander holds parsed options on the command, and a shared one answered every request with the last one's options.
 */
export const memoEntry = (io?: CliEntry["io"]): CliEntry => {
  const programs = new WeakMap<EntryContext, Command>()
  let failure: typeof import("../failure.js") | undefined
  return {
    app: APP,
    sqlite: true,
    interactive: interactiveOf,
    reasons: APP.errors.reasons,
    ...(io === undefined ? {} : { io }),
    run: async (entry) => {
      // failure.js loads cli-core's whole command tree, which a bare --version never needs.
      failure = await import("../failure.js")
      // A static import would load the store's SQLite before startCli could swap it.
      const { createProgram, liftGroup, refuseJoinedPath } = await import("../program.js")
      const { autoNotice, followInstall } = await import("./auto.js")
      const lifting = createProgram({ signal: entry.signal, setExitCode: entry.setExitCode })
      programs.set(entry, lifting)
      const { group, rest: args } = await liftGroup(lifting, entry.args, entry.env)
      const program =
        group === undefined ? lifting : createProgram({ signal: entry.signal, group, setExitCode: entry.setExitCode })
      programs.set(entry, program)
      // `memo jobs status` says it in full; everywhere else one line, until a timer run passes again.
      if (args[0] !== "jobs") {
        const notice = autoNotice(entry.env)
        if (notice) processStreams.diagnostic(notice)
      }
      const { updateNotice } = await import("../update.js")
      const notice = updateNotice(args)
      program.hook("preAction", (_root, command) => entry.atStart(command))
      failure.throwParseFailures(program)
      refuseJoinedPath(program, args)
      await program.parseAsync(args, { from: "user" })
      // After the command, so a broken systemctl never stands between the owner and the answer.
      await followInstall(entry.env).catch(() => undefined)
      const line = await notice
      if (line && !process.exitCode) processStreams.diagnostic(line)
      return undefined
    },
    fail: (error, entry) => {
      if (failure)
        return failure.reportFailure(error, {
          args: entry.args,
          program: programs.get(entry),
          streams: processStreams,
          tty: entry.tty,
        })
      // Before run loaded failure.js: the SQLite swap, or the import itself.
      const object = errorObjectOf(error)
      processStreams.diagnostic(
        renderError(object, { cli: APP.command, interactive: interactiveOf(entry.args, entry.tty) }),
      )
      return exitCodeOfError(object)
    },
  }
}
