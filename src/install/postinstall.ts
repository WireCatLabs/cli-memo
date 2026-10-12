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

/** As tg does: a global npm install puts the skill where agents look; MEMO_INSTALL_AGENT picks or skips. */
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
  const agent = env.MEMO_INSTALL_AGENT ?? "all"
  if (agent === "none") {
    note("memo: agent skill skipped by MEMO_INSTALL_AGENT=none; install with memo skill install --for all.")
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
