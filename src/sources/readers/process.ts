import { spawn } from "node:child_process"
import { CliError } from "@wirecat/cli-base"

const TIMEOUT_MS = 600_000
const MAX_OUTPUT = 4 * 1024 * 1024

/**
 * Variables a reader started by memo must not inherit: an API key would bill the owner's key instead of the signed-in
 * plan, and an agent's variables would make the reader's own runs look like that agent's.
 */
const WITHHELD = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDECODE", "AI_AGENT", "MEMO_MCP_CLIENT"]

export const readerEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !WITHHELD.includes(name)))

export interface Ran {
  code: number | null
  stdout: string
  stderr: string
}

/** Runs a reader's program to its end; `undefined` when it is not installed. */
export const runProgram = (
  program: string,
  args: string[],
  { env, cwd, stdin, signal }: { env: NodeJS.ProcessEnv; cwd?: string; stdin?: string; signal?: AbortSignal },
): Promise<Ran | undefined> =>
  new Promise((resolve, reject) => {
    const child = spawn(program, args, { env: readerEnv(env), cwd, stdio: ["pipe", "pipe", "pipe"], signal })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let bytes = 0
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS)
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > MAX_OUTPUT) child.kill("SIGTERM")
      else into.push(chunk)
    }
    child.stdout.on("data", collect(out))
    child.stderr.on("data", collect(err))
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (error.code === "ENOENT") resolve(undefined)
      else if (error.name === "AbortError") reject(new CliError("cancelled", `${program} was stopped`))
      else reject(error)
    })
    child.on("close", (code, killed) => {
      clearTimeout(timer)
      if (killed === "SIGTERM" && code === null)
        return reject(
          new CliError("timeout", `${program} gave no answer in time, or too long an answer`, {
            reason: "reader.timeout",
          }),
        )
      resolve({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") })
    })
    child.stdin.on("error", () => {})
    child.stdin.end(stdin ?? "")
  })

/** The first line a program printed, short enough for an answer; never the text it read. */
export const firstLine = (text: string) => text.trim().split("\n")[0]?.slice(0, 200) ?? ""
