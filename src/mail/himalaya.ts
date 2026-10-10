import { execFile } from "node:child_process"
import { CliError } from "@wirecat/cli-core"

export type Himalaya = (args: string[], input?: string) => Promise<string>

/** `MEMO_HIMALAYA` names the program, so the test sandbox can point it at a fake. */
export const himalaya =
  (env: NodeJS.ProcessEnv = process.env): Himalaya =>
  (args, input) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        env.MEMO_HIMALAYA ?? "himalaya",
        args,
        { env, maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error === null) resolve(stdout)
          else
            reject(
              new CliError("provider_error", `himalaya ${args[0] ?? ""} failed: ${stderr.trim() || error.message}`),
            )
        },
      )
      child.stdin?.end(input ?? "")
    })
