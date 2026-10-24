import { join } from "node:path"
import { createRenderer, resolvePaths, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { FETCH, overrideSharedContract, upgradeCommand as sharedUpgradeCommand } from "@wirecat/cli-core/cli"
import { appUpdate, type UpdateEnvironment } from "@wirecat/cli-core/update"
import type { Command } from "commander"
import { APP } from "./app.js"
import { loadConfig } from "./config.js"
import { VERSION } from "./version.js"

export type { UpdateEnvironment }

export const PACKAGE = "@wirecat/cli-memo"

export const { installer, latest, runUpdate, updateNotice } = appUpdate({
  packageName: PACKAGE,
  command: APP.command,
  version: VERSION,
  entry: import.meta.url,
  statePath: (env) =>
    join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "update-check.json"),
  enabled: (env) => loadConfig(env).update_check !== false,
  // MEMO_AUTO marks the timer's own run, where nobody reads stderr.
  offVariables: ["MEMO_NO_UPDATE_CHECK", "MEMO_AUTO"],
  quietWords: ["--help", "-h", "--version", "-V", "--json", "--quiet", "commands", "upgrade", "mcp", "complete"],
})

/** cli-core's `upgrade`: the package manager that installed memo, or only a look with `--check`. */
export const upgradeCommand = (streams: Streams, environment: UpdateEnvironment = {}): Command =>
  overrideSharedContract(
    sharedUpgradeCommand(APP, PACKAGE, (command) => {
      const format = command.opts().json ? "json" : "pretty"
      return {
        renderer: createRenderer({ format, color: false, streams }),
        format,
        streams,
        installer: () => installer(environment),
        latest: () => latest(environment),
        install: (argv) => runUpdate(argv, environment),
      }
    }),
    "Memo's package updater checks npm and uses command-local JSON because it has no messenger program shell.",
    (command) => {
      annotate(command, { effects: FETCH })
      command.option("--json", "print JSON")
    },
  )
