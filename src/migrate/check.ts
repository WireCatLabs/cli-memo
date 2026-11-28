import { readFileSync, realpathSync } from "node:fs"
import { userInfo } from "node:os"
import { join } from "node:path"

/** Where npm, pnpm and bun all put the package; a checkout, its build and CI run from anywhere else. */
const INSTALLED = "/node_modules/@wirecat/wirecat/"

/**
 * Whether this start may still have memo's files to move, from Node built-ins only: the bin asks on every start, so
 * the migration code loads only before the marker says it is done. `migrateFromMemo` decides the rest.
 * Only an installed wcat moves anything: `cli-dev lint` and the smoke run a checkout's bin with the developer's own
 * home, and once moved the owner's memo folders and timers on 2026-11-28.
 */
export const mayMigrate = (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  script: string | undefined = "",
): boolean => {
  if (!script) return false
  let real: string
  try {
    // npm and pnpm start the program through a link in their bin folder.
    real = realpathSync(script)
  } catch {
    real = script
  }
  if (!real.replaceAll("\\", "/").includes(INSTALLED)) return false
  const kinds = ["CONFIG", "STATE", "CACHE"]
  if (kinds.some((kind) => env[`WCAT_${kind}_DIR`] || env[`MEMO_${kind}_DIR`])) return false
  let home: string
  try {
    home = userInfo().homedir
  } catch {
    return false
  }
  if (platform !== "win32" && env.HOME && env.HOME !== home) return false
  const state =
    platform === "win32"
      ? join(env.LOCALAPPDATA || join(env.USERPROFILE || home, "AppData", "Local"), "wcat", "Data")
      : join(env.XDG_DATA_HOME || join(env.HOME || home, ".local", "share"), "wcat")
  try {
    return (
      (JSON.parse(readFileSync(join(state, "migrated-from-memo.json"), "utf8")) as { keyring?: string }).keyring !==
      "done"
    )
  } catch {
    return true
  }
}
