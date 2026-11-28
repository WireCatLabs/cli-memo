import { readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { installSkill, type SkillTarget, skillPath, skillVersion } from "@wirecat/cli-base/skill"
import { APP } from "../app.js"

const OLD_SKILL_NAME = /^name:\s*["']?cli-memo["']?\s*$/m

/**
 * memo's skill folders. Only a SKILL.md that memo's install stamped (its name and a version) counts, so a folder the
 * owner wrote by hand stays.
 */
export const memoSkills = (env: NodeJS.ProcessEnv): { target: SkillTarget; folder: string }[] =>
  (["claude", "agents"] as const)
    .map((target) => ({ target, folder: dirname(skillPath(target, "cli-memo", env)) }))
    .filter(({ folder }) => {
      try {
        const text = readFileSync(join(folder, "SKILL.md"), "utf8")
        return OLD_SKILL_NAME.test(text) && skillVersion(text) !== undefined
      } catch {
        return false
      }
    })

export const removeMemoSkills = (env: NodeJS.ProcessEnv): SkillTarget[] => {
  const found = memoSkills(env)
  for (const { folder } of found) rmSync(folder, { recursive: true, force: true })
  return found.map(({ target }) => target)
}

export const SKILL = new URL("../../skills/wcat/SKILL.md", import.meta.url)

/** Where memo's skill was installed, wcat's takes its place, and memo's folder goes. */
export const replaceMemoSkill = (env: NodeJS.ProcessEnv, skill: URL = SKILL): SkillTarget[] => {
  const found = memoSkills(env)
  if (found.length > 0) installSkill(APP, skill, { env, targets: found.map(({ target }) => target) })
  return removeMemoSkills(env)
}
