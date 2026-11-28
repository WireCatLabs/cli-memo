import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { installSkill, type SkillTarget } from "@wirecat/cli-base/skill"
import { binFolder, ensureLauncher, type LauncherState } from "@wirecat/cli-base/wcat"
import { APP } from "../app.js"
import { DESKTOP } from "../identity.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const TARGETS: Record<string, readonly SkillTarget[]> = {
  all: ["claude", "agents"],
  claude: ["claude"],
  codex: ["agents"],
  cursor: ["agents"],
  gemini: ["agents"],
}

/**
 * The package cannot declare a `wcat` bin: npm refuses one over the launcher another WireCat tool wrote. So the
 * install writes the launcher, as every start of wcat-wirecat does again.
 */
export const writeLauncher = ({
  env = process.env,
  packageRoot = root,
  platform = process.platform,
}: {
  env?: NodeJS.ProcessEnv
  packageRoot?: string
  platform?: NodeJS.Platform
} = {}): LauncherState | undefined => {
  const folder = binFolder({
    name: DESKTOP.command,
    script: join(packageRoot, "dist", "bin", "wcat-wirecat.js"),
    env,
    platform,
  })
  return folder ? ensureLauncher({ ...folder, platform }) : undefined
}

/**
 * A global npm install puts the skill where agents look only when WCAT_INSTALL_AGENT names one: npm hides a
 * lifecycle script's output, so writing into the owner's agent folders must be asked for.
 */
export const completeGlobalInstall = ({
  env = process.env,
  packageRoot = root,
  note = (message: string) => process.stderr.write(`${message}\n`),
}: {
  env?: NodeJS.ProcessEnv
  packageRoot?: string
  note?: (message: string) => void
} = {}): void => {
  if (env.npm_config_global !== "true") return
  writeLauncher({ env, packageRoot })
  const agent = env.WCAT_INSTALL_AGENT
  if (agent === undefined || agent === "none") {
    note("wcat: agent skill not installed; run wcat skill install --for all.")
    return
  }
  const targets = TARGETS[agent]
  if (targets === undefined) throw new Error("WCAT_INSTALL_AGENT must be all, codex, cursor, claude, gemini or none")
  installSkill(
    { command: APP.command, appName: APP.appName, version: APP.version },
    pathToFileURL(join(packageRoot, "skills/wcat/SKILL.md")),
    { env, targets },
  )
  note("wcat: agent skill installed. Agent: read wcat skill show before using wcat.")
}
