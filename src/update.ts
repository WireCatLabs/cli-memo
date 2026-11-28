import { join } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import { appUpdate, type UpdateEnvironment } from "@wirecat/cli-core/update"
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
