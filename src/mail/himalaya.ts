import { execFile } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { CliError } from "@wirecat/cli-base"
import { providerRequest } from "@wirecat/cli-core/cli"

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

// RFC 5530's AUTHENTICATIONFAILED, and himalaya's own words for a login or a keyring that fails: asking again
// in 15 s gets the same answer, so such a failure is not retried.
const LOGIN_FAILED = /AUTHENTICATIONFAILED|authentication failed|cannot authenticate|invalid credentials|keyring/i

const lasting = new WeakSet<Error>()
const lastingly = (error: CliError): CliError => {
  lasting.add(error)
  return error
}

/**
 * himalaya 2.2 prints its own failure on stdout, not stderr ("Error: …" then "Suggestions:"), so a failure whose
 * stderr is empty reads it from there; an IMAP answer above it is left out.
 */
export const errorReport = (stdout: string): string[] => {
  const lines = stdout.split(/\r?\n/)
  const start = lines.findLastIndex((line) => line.startsWith("Error:"))
  if (start < 0) return []
  const end = lines.findIndex((line, index) => index > start && line.startsWith("Suggestions:"))
  return stderrTail(lines.slice(start, end < 0 ? undefined : end).join("\n"))
}

// Every IMAP command memo sends only reads, so running one again is safe; a write must never be repeated.
const WRITES = /^\S+\s+(?:UID\s+)?(?:STORE|EXPUNGE|COPY|MOVE|APPEND|DELETE|CREATE|RENAME)\b/im

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

const WORD = /^[a-z][a-z-]{0,23}$/

/** `himalaya.envelope.list`: the subcommand words only; an account, folder or query never matches. */
export const operationOf = (args: readonly string[]): string =>
  ["himalaya", ...args.slice(0, 2).filter((word) => WORD.test(word))].join(".")

const once =
  (
    env: NodeJS.ProcessEnv,
    signal?: AbortSignal,
    retry: { attempt: number; waitMs?: number } = { attempt: 1 },
  ): Himalaya =>
  (args, input, options) =>
    new Promise((resolve, reject) => {
      const answered = providerRequest(operationOf(args), undefined, retry)
      const child = execFile(
        env.MEMO_HIMALAYA ?? "himalaya",
        args,
        { env, maxBuffer: options?.maxBuffer ?? 64 * 1024 * 1024, ...(signal ? { signal } : {}) },
        (error, stdout, stderr) => {
          if (error === null) {
            answered({ status: 0 })
            return resolve(stdout)
          }
          const exit = (error as ExecFailure).code
          const printed = stderrTail(stderr)
          const tail = printed.length ? printed : errorReport(String(stdout))
          const throttled =
            isThrottled(stderr) || isThrottled(String(stdout).slice(-4096)) || isThrottled(tail.join("
"))
          answered({
            ...(typeof exit === "number" ? { status: exit } : {}),
            error,
            ...(throttled ? { providerError: "mail.throttled" } : {}),
          })
          if (signal?.aborted) return reject(signal.reason)
          const what = `himalaya ${args[0] ?? ""} ${args[1] ?? ""}`.trim()
          if (throttled) return reject(throttledError(what))
          const failure = error as ExecFailure
          if (failure.code === "ENOENT")
            return reject(
              lastingly(
                new CliError("provider_error", `${what}: himalaya is not installed or not on PATH`, {
                  reason: "mail.source-failed",
                }),
              ),
            )
          const ended = howItEnded(failure)
          const said =
            tail.at(-1) ?? (/maxBuffer/i.test(failure.message) ? "its answer was too large" : "no error text")
          const failed = new CliError("provider_error", `${what} failed (${ended}): ${said}`, {
            reason: "mail.source-failed",
            ...(typeof failure.code === "number" ? { exit_code: failure.code } : {}),
            ...(failure.signal ? { signal: failure.signal } : {}),
            stderr_tail: tail,
          })
          reject(LOGIN_FAILED.test(`${stderr}\n${String(stdout).slice(-4096)}`) ? lastingly(failed) : failed)
        },
      )
      // A himalaya that exits before reading its input breaks the pipe (EPIPE); how it ended is reported above.
      child.stdin?.on("error", () => {})
      child.stdin?.end(input ?? "")
    })

/**
 * `MEMO_HIMALAYA` names the program, so the test sandbox can point it at a fake. A read that fails is tried once
 * more after `MEMO_HIMALAYA_RETRY_MS` (15 s): six failed runs in two days (2026-10-14/15) each passed on the next run.
 * A failed login is not: with two accounts it held sync for a minute.
 */
export const himalaya =
  (env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal): Himalaya =>
  async (args, input, options) => {
    try {
      return await once(env, signal)(args, input, options)
    } catch (error) {
      const again =
        error instanceof CliError &&
        error.code === "provider_error" &&
        !lasting.has(error) &&
        !error.message.includes("too large") &&
        !WRITES.test(input ?? "")
      if (!again) throw error
      // Stop sends SIGKILL 5 s after SIGTERM; a 15 s wait would lose the resume point.
      const waitMs = Number(env.MEMO_HIMALAYA_RETRY_MS ?? 15_000)
      await sleep(waitMs, undefined, signal ? { signal } : {}).catch(() => {
        throw signal?.reason
      })
      return once(env, signal, { attempt: 2, waitMs })(args, input, options)
    }
  }
