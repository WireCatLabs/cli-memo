import { join } from "node:path"
import { CliError, resolvePaths } from "@wirecat/cli-base"
import { releaseLock, takeLock } from "@wirecat/cli-messaging/background"

/** Runs one import at a time: `memo sync`, the timer and `memo mail <account> import` share this lock. */
export const withImportLock = async <T>(env: NodeJS.ProcessEnv, work: () => Promise<T>): Promise<T> => {
  const lock = join(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).state, "import.lock")
  const holder = takeLock(lock, { pid: process.pid, startedAt: new Date().toISOString() })
  if (holder !== undefined)
    throw new CliError("rate_limited", `an import is already running (process ${holder.pid}); try again when it ends`)
  try {
    return await work()
  } finally {
    releaseLock(lock, process.pid)
  }
}
