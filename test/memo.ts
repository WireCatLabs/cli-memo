import { captureStreams } from "@wirecat/cli-base"
import type { Command } from "commander"
import { createProgram, liftGroup } from "../src/program.js"
import { answerOf } from "./answer.js"

const quiet = (command: Command): Command => {
  command.exitOverride()
  command.configureOutput({ writeErr: () => {} })
  for (const child of command.commands) quiet(child)
  return command
}

/** Runs memo as bin/memo.ts does: the group word lifted first, then the program made for that group. */
export const memoIn =
  (env: NodeJS.ProcessEnv) =>
  async (...args: string[]) => {
    const streams = captureStreams()
    const { group, rest } = liftGroup(createProgram({ streams, env }), args)
    const program = quiet(createProgram({ streams, env, ...(group === undefined ? {} : { group }) }))
    await program.parseAsync([...rest, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
