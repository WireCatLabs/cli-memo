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
import { type Command, CommanderError } from "commander"
import { ValiError } from "valibot"
import { APP } from "./app.js"
import { REASONS } from "./reasons.js"

let shared: FailureContext | undefined

// cli-core's CLI module costs every memo command ~70 ms to load, so only a failure loads it.
const contextOf = async (): Promise<FailureContext> => {
  if (shared) return shared
  try {
    shared = (await import("@wirecat/cli-core/cli")).failureContext(APP.errors)
  } catch {
    return { reasons: REASONS }
  }
  return shared
}

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

export const errorObject = async (error: unknown) => errorObjectOf(recognisable(error), await contextOf())

/** The same object as `--json` prints on stderr, as MCP's `isError` answer. */
export const mcpFailure = async (error: unknown) => mcpErrorResult(await errorObject(error))

const MACHINE_FLAGS = new Set(["--json", "--jsonl"])

const optionsOf = (args: readonly string[]) => {
  const end = args.indexOf("--")
  return end < 0 ? args : args.slice(0, end)
}

/** A person at a terminal who did not ask for machine output. */
export const interactiveOf = (args: readonly string[], tty: boolean) =>
  tty && !optionsOf(args).some((flag) => MACHINE_FLAGS.has(flag))

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
export const reportFailure = async (error: unknown, { args, program, streams, tty }: ReportOptions) => {
  const failure = recognisable(error)
  const object = errorObjectOf(failure, await contextOf())
  const flags = optionsOf(args)
  const record = flags.includes("--debug")
    ? errorRecordOf(failure, object, { command: commandOf(program, flags), service: APP.command, version: APP.version })
    : undefined
  streams.diagnostic(
    renderError(object, { cli: APP.command, interactive: interactiveOf(args, tty), ...(record ? { record } : {}) }),
  )
  return exitCodeOfError(object)
}
