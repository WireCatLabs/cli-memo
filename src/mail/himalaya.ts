import { execFile } from "node:child_process"
import { CliError } from "@wirecat/cli-base"

export type Himalaya = (args: string[], input?: string, options?: { maxBuffer?: number }) => Promise<string>

const TAIL_LINES = 5

/** Gmail's words for "too much IMAP traffic from this account": a tagged `NO [THROTTLED]`, or a refused login. */
const THROTTLED = /\[THROTTLED\]|Too many simultaneous connections|Account exceeded command or bandwidth limits/i

// A login line or a URL can carry a password or a token; nothing after these words reaches an error.
const SECRET = /((?:pass(?:word)?|token|secret|auth[a-z]*|bearer|key)\s*[:=]?\s*)\S+/gi

const redact = (line: string): string => line.replace(/\/\/[^/@\s]+@/g, "//…@").replace(SECRET, "$1…")

/** The last lines of himalaya's stderr, without credentials, for the error's details and the failed line. */
export const stderrTail = (stderr: string): string[] =>
  stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-TAIL_LINES)
    .map(redact)

export const isThrottled = (text: string): boolean => THROTTLED.test(text)

export const throttledError = (what: string): CliError =>
  new CliError("rate_limited", `${what}: Gmail is limiting this account's IMAP traffic; try again in an hour or more`, {
    reason: "mail.throttled",
  })

interface ExecFailure extends Error {
  code?: number | string
  signal?: NodeJS.Signals | null
}

const howItEnded = ({ code, signal }: ExecFailure): string =>
  signal ? `killed by ${signal}` : typeof code === "number" ? `exit ${code}` : String(code ?? "failed")

/** `MEMO_HIMALAYA` names the program, so the test sandbox can point it at a fake. */
export const himalaya =
  (env: NodeJS.ProcessEnv = process.env): Himalaya =>
  (args, input, options) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        env.MEMO_HIMALAYA ?? "himalaya",
        args,
        { env, maxBuffer: options?.maxBuffer ?? 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error === null) return resolve(stdout)
          const what = `himalaya ${args[0] ?? ""} ${args[1] ?? ""}`.trim()
          if (isThrottled(stderr) || isThrottled(String(stdout).slice(-4096))) return reject(throttledError(what))
          const failure = error as ExecFailure
          const tail = stderrTail(stderr)
          const ended = howItEnded(failure)
          const said =
            tail.at(-1) ?? (/maxBuffer/i.test(failure.message) ? "its answer was too large" : "no error text")
          reject(
            new CliError("provider_error", `${what} failed (${ended}): ${said}`, {
              reason: "mail.source-failed",
              ...(typeof failure.code === "number" ? { exit_code: failure.code } : {}),
              ...(failure.signal ? { signal: failure.signal } : {}),
              stderr_tail: tail,
            }),
          )
        },
      )
      // A himalaya that exits before reading its input breaks the pipe (EPIPE); how it ended is reported above.
      child.stdin?.on("error", () => {})
      child.stdin?.end(input ?? "")
    })
