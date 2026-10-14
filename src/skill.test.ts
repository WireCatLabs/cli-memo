import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { validateSkill } from "@wirecat/cli-core/skill-validation"
import { expect, it } from "vitest"
import { completeGlobalInstall } from "./install/postinstall.js"
import { createProgram } from "./program.js"
import { VERSION } from "./version.js"

const skill = new URL("../skills/cli-memo/SKILL.md", import.meta.url)

it("ships a skill whose frontmatter and every memo command it names are valid", () => {
  expect(validateSkill(readFileSync(skill, "utf8"), { folder: "cli-memo", program: createProgram() })).toEqual([])
})

it("prints the skill and installs it, stamped with this version, where agents look", async () => {
  const home = mkdtempSync(join(tmpdir(), "memo-skill-"))
  const streams = captureStreams()
  await createProgram({ streams }).parseAsync(["skill", "show"], { from: "user" })
  expect(streams.stdout.join("")).toContain("name: cli-memo")

  await createProgram({ streams: captureStreams(), env: { ...process.env, HOME: home } }).parseAsync(
    ["skill", "install", "--for", "claude"],
    { from: "user" },
  )
  expect(readFileSync(join(home, ".claude", "skills", "cli-memo", "SKILL.md"), "utf8")).toContain(
    `version: "${VERSION}"`,
  )
})

it("installs the skill on a global npm install unless told not to", () => {
  const install = (env: Record<string, string>) => {
    const home = mkdtempSync(join(tmpdir(), "memo-postinstall-"))
    const notes: string[] = []
    completeGlobalInstall({ env: { HOME: home, ...env }, note: (line) => notes.push(line) })
    const written = (target: string) => {
      try {
        return readFileSync(join(home, target, "skills", "cli-memo", "SKILL.md"), "utf8").length > 0
      } catch {
        return false
      }
    }
    return { claude: written(".claude"), agents: written(".agents"), notes }
  }
  expect(install({ npm_config_global: "true" })).toMatchObject({ claude: true, agents: true })
  expect(install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "codex" })).toMatchObject({
    claude: false,
    agents: true,
  })
  expect(install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "none" })).toMatchObject({ claude: false })
  expect(install({})).toMatchObject({ claude: false, agents: false })
  expect(() => install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "vim" })).toThrow(/MEMO_INSTALL_AGENT/)
})
