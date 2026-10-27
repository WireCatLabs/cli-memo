import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { installSkill, type SkillTarget } from "@wirecat/cli-base/skill"
import { APP } from "../app.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const TARGETS: Record<string, readonly SkillTarget[]> = {
  all: ["claude", "agents"],
  claude: ["claude"],
  codex: ["agents"],
  cursor: ["agents"],
  gemini: ["agents"],
}

/**
 * A global npm install puts the skill where agents look only when MEMO_INSTALL_AGENT names one: npm hides a
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
  const agent = env.MEMO_INSTALL_AGENT
  if (agent === undefined || agent === "none") {
    note("memo: agent skill not installed; run memo skill install --for all.")
    return
  }
  const targets = TARGETS[agent]
  if (targets === undefined) throw new Error("MEMO_INSTALL_AGENT must be all, codex, cursor, claude, gemini or none")
  installSkill(
    { command: APP.command, appName: APP.appName, version: APP.version },
    pathToFileURL(join(packageRoot, "skills/cli-memo/SKILL.md")),
    { env, targets },
  )
  note("memo: agent skill installed. Agent: read memo skill show before using memo.")
}
