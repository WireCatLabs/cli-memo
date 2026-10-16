import { realpathSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRenderer, resolvePaths, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { FetchLike } from "@wirecat/cli-base/http"
import {
  type Installer,
  installerOf,
  latestVersion,
  runUpdate as runPackageManager,
  updateNotice as sharedNotice,
} from "@wirecat/cli-base/update"
import { FETCH, upgradeCommand as sharedUpgradeCommand } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { APP } from "./app.js"
import { loadConfig } from "./config.js"
import { VERSION } from "./version.js"

export const PACKAGE = "@wirecat/cli-memo"

/** npm, the clock, the terminal and the package manager as `memo upgrade` sees them — faked in a test. */
export interface UpdateEnvironment {
  fetch?: FetchLike
  now?: () => number
  stderrIsTTY?: boolean
  scriptPath?: string
  /** Runs the update and answers its exit code; its output goes to stderr. */
  spawn?: (argv: string[]) => number
}

export const installer = ({ scriptPath }: UpdateEnvironment = {}): Installer =>
  installerOf(scriptPath ?? realpathSync(fileURLToPath(import.meta.url)))

const latest = (environment: UpdateEnvironment) =>
  latestVersion(PACKAGE, environment.fetch ?? fetch, { timeoutMs: 3000 })

const statePath = (env: NodeJS.ProcessEnv) =>
  join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "update-check.json")

const enabled = (env: NodeJS.ProcessEnv): boolean => {
  try {
    return loadConfig(env).update_check !== false
  } catch {
    return false
  }
}

// Words after which a line on stderr would land in a machine's answer, or would only repeat the command.
const QUIET_WORDS = ["--help", "-h", "--version", "-V", "--json", "--quiet", "commands", "upgrade", "mcp", "complete"]

/**
 * The daily "a newer memo exists" line, or `undefined`. Started beside the command and awaited after it, so
 * asking npm costs the command nothing; any failure is silence. Never inside the timer's own run.
 */
export const updateNotice = (
  argv: readonly string[],
  { env = process.env, environment = {} }: { env?: NodeJS.ProcessEnv; environment?: UpdateEnvironment } = {},
): Promise<string | undefined> => {
  try {
    const delimiter = argv.indexOf("--")
    const words = argv.slice(0, delimiter < 0 ? undefined : delimiter)
    if (env.MEMO_AUTO === "1" || words.some((word) => QUIET_WORDS.includes(word) || word.startsWith("--json=")))
      return Promise.resolve(undefined)
    return sharedNotice({
      argv,
      packageName: PACKAGE,
      command: APP.command,
      version: VERSION,
      statePath: statePath(env),
      fetch: environment.fetch ?? fetch,
      ...(environment.now ? { now: environment.now } : {}),
      format: "pretty",
      stderrIsTTY: environment.stderrIsTTY ?? process.stderr.isTTY === true,
      quiet: false,
      enabled: enabled(env),
      installer: installer(environment),
      env,
      offVariables: ["MEMO_NO_UPDATE_CHECK"],
    }).then((line) => line?.replace("`memo update`", "`memo upgrade`"))
  } catch {
    return Promise.resolve(undefined)
  }
}

/** cli-core's `upgrade`: the package manager that installed memo, or only a look with `--check`. */
export const upgradeCommand = (streams: Streams, environment: UpdateEnvironment = {}): Command =>
  annotate(
    sharedUpgradeCommand(APP, PACKAGE, (command) => {
      const format = command.opts().json ? "json" : "pretty"
      return {
        renderer: createRenderer({ format, color: false, streams }),
        format,
        streams,
        installer: () => installer(environment),
        latest: () => latest(environment),
        install: (argv) => (environment.spawn ? environment.spawn(argv) : runPackageManager(argv)),
      }
    }),
    { effects: FETCH },
  ).option("--json", "print JSON")
