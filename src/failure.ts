import {
  CliError,
  errorObjectOf,
  errorRecordOf,
  exitCodeOfError,
  type FailureContext,
  mcpErrorResult,
  renderError,
  type Streams,
} from "@wirecat/cli-base"
import { failureContext, judgedEffects } from "@wirecat/cli-core/cli"
import { type Command, CommanderError } from "commander"
import { ValiError } from "valibot"
import { APP } from "./app.js"
import { EFFECTS } from "./effects.js"
import { interactiveOf, optionsOf } from "./terminal.js"

const context: FailureContext = failureContext(APP.errors)

const recognisable = (error: unknown): unknown => {
  if (error instanceof CommanderError)
    return new CliError("validation_error", error.message.replace(/^error: /, ""), { reason: "input.invalid" })
  if (error instanceof ValiError) {
    const [issue] = error.issues
    const param = issue?.path?.map((item: { key: unknown }) => String(item.key)).join(".")
    return new CliError("validation_error", issue?.message ?? "the input is not valid", {
      reason: "input.invalid",
      ...(param ? { param } : {}),
    })
  }
  return error
}

export const errorObject = (error: unknown) => errorObjectOf(recognisable(error), context)

/** The same object as `--json` prints on stderr, as MCP's `isError` answer. */
export const mcpFailure = (error: unknown) => mcpErrorResult(errorObject(error))

const commandOf = (program: Command | undefined, args: readonly string[]) => {
  const path: string[] = []
  let at = program
  for (const arg of args) {
    if (arg.startsWith("-")) continue
    const child: Command | undefined = at?.commands.find((command) => command.name() === arg)
    if (!child) break
    path.push(child.name())
    at = child
  }
  return path.join(" ") || "memo"
}

/** Parse failures reach the handler as `CommanderError` instead of Commander's own text and exit. */
export const throwParseFailures = (program: Command): void => {
  program.exitOverride().configureOutput({ outputError: () => undefined })
  for (const command of program.commands) throwParseFailures(command)
}

export interface ReportOptions {
  /** The arguments after the program name. */
  args: readonly string[]
  /** Names the failed command in the `--debug` record. */
  program?: Command
  streams: Streams
  tty: boolean
}

/** One error object on stderr, `✗ message` at a terminal; returns the exit code. */
export const reportFailure = (error: unknown, { args, program, streams, tty }: ReportOptions) => {
  const failure = recognisable(error)
  const flags = optionsOf(args)
  const effects = judgedEffects(EFFECTS[commandOf(program, flags)])
  const object = errorObjectOf(failure, { ...context, ...(effects ? { effects } : {}) })
  const record = flags.includes("--debug")
    ? errorRecordOf(failure, object, { command: commandOf(program, flags), service: APP.command, version: APP.version })
    : undefined
  streams.diagnostic(
    renderError(object, { cli: APP.command, interactive: interactiveOf(args, tty), ...(record ? { record } : {}) }),
  )
  return exitCodeOfError(object)
}
