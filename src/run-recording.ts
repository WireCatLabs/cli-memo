import { AsyncLocalStorage } from "node:async_hooks"
import { isCliError, type Streams } from "@wirecat/cli-base"
import {
  environmentOf,
  KEEP_RUNS_FOR_DAYS,
  type Recording,
  type RequestEvent,
  startRecording,
  wasSettled,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { APP } from "./app.js"
import { loadConfig } from "./config.js"
import { recognisable } from "./failure.js"

interface Parse {
  recording?: Recording
}

// The mail and RDAP clients are plain functions, far from the program: they find the parse they belong to here.
const parses = new AsyncLocalStorage<Parse>()

export const providerEvent = (event: RequestEvent): void => parses.getStore()?.recording?.events(event)

/** Times one provider call. The operation is a fixed name; nothing the call carries goes into the record. */
export const providerRequest = (operation: string) => {
  providerEvent({ event: "request", operation })
  const started = performance.now()
  return (outcome: { status?: number; error?: unknown }): void =>
    providerEvent({
      event: "response",
      operation,
      ...(outcome.status === undefined ? {} : { status: outcome.status }),
      durationMs: Math.round(performance.now() - started),
      outcome: outcome.error === undefined ? "ok" : "error",
      ...(outcome.error === undefined
        ? {}
        : { errorCode: isCliError(outcome.error) ? outcome.error.code : "provider_error" }),
    })
}

const settingsOf = (env: NodeJS.ProcessEnv): { record?: boolean; keepDays?: number } => {
  try {
    const config = loadConfig(env)
    return {
      ...(config.record === undefined ? {} : { record: config.record }),
      ...(config.keep_runs_for_days === undefined ? {} : { keepDays: config.keep_runs_for_days }),
    }
  } catch {
    // A config that will not load is a failure worth keeping too; the defaults stand in for it.
    return {}
  }
}

const pathOf = (command: Command): string[] => {
  const words: string[] = []
  for (let at: Command | null = command; at?.parent; at = at.parent) words.unshift(at.name())
  return words
}

/** The command words of a line that failed before any action: up to the first word that is not a command. */
const pathFromArgs = (program: Command, args: readonly string[]): string[] => {
  const words: string[] = []
  let current = program
  for (const arg of args) {
    if (arg.startsWith("-")) continue
    const next = current.commands.find((one) => one.name() === arg || one.aliases().includes(arg))
    if (!next) break
    words.push(arg)
    current = next
  }
  return words
}

const isHelpOrVersion = (error: unknown): boolean =>
  error instanceof Error && "code" in error && /^commander\.(help|helpDisplayed|version)$/.test(String(error.code))

/**
 * Keeps a run of every failed memo command, and of every command under `--record` or `record: true`. Reading the
 * runs is not itself recorded.
 */
export const recordRuns = (program: Command, env: NodeJS.ProcessEnv, streams: Streams): void => {
  program
    .option("--record", "keep this run — ids and timings, never note or mail content")
    .option("--no-record", "do not keep this run, even if it fails")
  const start = (words: string[], flag: boolean | undefined, json: boolean): Recording | undefined => {
    if (words[0] === "runs") return undefined
    const settings = settingsOf(env)
    const record = flag ?? settings.record ?? false
    return startRecording({
      app: APP,
      command: `${environmentOf(program).agent ? "mcp " : ""}${words.join(" ") || APP.command}`,
      profile: "",
      record,
      keepFailed: record || (flag !== false && settings.record !== false),
      trace: false,
      format: json ? "json" : "pretty",
      streams,
      env,
      keepDays: settings.keepDays ?? KEEP_RUNS_FOR_DAYS,
    })
  }
  program.hook("preAction", (_root, action) => {
    const parse = parses.getStore()
    if (!parse) return
    const flags = action.optsWithGlobals<{ record?: boolean; json?: unknown }>()
    parse.recording = start(pathOf(action), flags.record, flags.json !== undefined)
  })
  const parseAsync = program.parseAsync.bind(program)
  program.parseAsync = (argv, options) => {
    const parse: Parse = {}
    return parses.run(parse, async () => {
      try {
        const parsed = await parseAsync(argv, options)
        await parse.recording?.succeed()
        return parsed
      } catch (error) {
        if (!isHelpOrVersion(error) && !wasSettled(error)) {
          const args = [...((options?.from === "user" ? argv : argv?.slice(2)) ?? process.argv.slice(2))]
          const flag = args.includes("--no-record") ? false : args.includes("--record") ? true : undefined
          const json = args.some((arg) => arg === "--json" || arg.startsWith("--json="))
          await (parse.recording ?? start(pathFromArgs(program, args), flag, json))?.fail(recognisable(error))
        }
        throw error
      }
    })
  }
}
