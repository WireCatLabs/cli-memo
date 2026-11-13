import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { validateSkill } from "@wirecat/cli-core/skill-validation"
import type { Command } from "commander"
import { expect, it } from "vitest"
import { completeGlobalInstall } from "./install/postinstall.js"
import { createProgram, SKILL_TOPICS } from "./program.js"
import { VERSION } from "./version.js"

const skill = new URL("../skills/cli-memo/SKILL.md", import.meta.url)
const topics = SKILL_TOPICS.map((topic) => new URL(`../skills/cli-memo/topics/${topic}.md`, import.meta.url))
const morning = new URL("../skills/morning-digest/SKILL.md", import.meta.url)

it("ships a skill whose frontmatter and every memo command it names are valid", () => {
  expect(validateSkill(readFileSync(skill, "utf8"), { folder: "cli-memo", program: createProgram() })).toEqual([])
})

it("keeps the skill every session reads short, the rest in topics it names", async () => {
  const text = readFileSync(skill, "utf8")
  expect(text.length).toBeLessThan(4000)
  for (const topic of SKILL_TOPICS) {
    expect(text).toContain(`\`${topic}\``)
    const streams = captureStreams()
    await createProgram({ streams }).parseAsync(["skill", "show", topic], { from: "user" })
    expect(streams.stdout.join("")).toMatch(/^# memo — /)
  }
})

// Claude Code saves a longer Bash output to a file a scheduled agent may not read: 16.7 KB was cut off, 14.7 KB was not.
it("keeps the mail-triage skill short enough that a scheduled agent reads it whole from one memo call", () => {
  expect(readFileSync(new URL("../skills/mail-triage/SKILL.md", import.meta.url), "utf8").length).toBeLessThan(14_700)
})

const subcommand = (parent: Command, word: string) =>
  parent.commands.find((command) => command.name() === word || command.aliases().includes(word))

/** The leading words of a command line that name commands; the first word that does not is an argument. */
const commandPath = (root: Command, words: string[]): { path: string[]; rest: string[] } => {
  let at = root
  const path: string[] = []
  for (const word of words) {
    const next = subcommand(at, word)
    if (next === undefined) break
    path.push(word)
    at = next
  }
  return { path, rest: words.slice(path.length) }
}

const memoLines = (text: string): string[][] => {
  const fenced = [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].flatMap(([, block = ""]) => block.split("\n"))
  const inline = [...text.replaceAll(/^```[\s\S]*?^```/gm, "").matchAll(/`(memo [^`]+)`/g)].map(([, span = ""]) => span)
  return [...fenced, ...inline]
    .filter((line) => line.startsWith("memo "))
    .map((line) =>
      line
        .replace(/\s#.*$/, "")
        .split(/\s+/)
        .slice(1)
        .filter((word) => word !== "" && !/^[-<'"[]/.test(word)),
    )
}

it("names only commands that exist, and `memo commands` only with a path that exists", () => {
  const program = createProgram()
  const lines = [skill, ...topics, morning].flatMap((file) => memoLines(readFileSync(file, "utf8")))
  expect(lines.length).toBeGreaterThan(10)
  for (const words of lines.filter((line) => line.length > 0)) {
    const { path } = commandPath(program, words)
    expect(path.length, `memo ${words.join(" ")} names no command`).toBeGreaterThan(0)
    if (path[0] === "commands")
      expect(commandPath(program, words.slice(1)).rest, `memo ${words.join(" ")}: not a command path`).toEqual([])
  }
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
  const installed = join(home, ".claude", "skills", "cli-memo", "SKILL.md")
  expect(readFileSync(installed, "utf8")).toContain(`version: "${VERSION}"`)
  writeFileSync(installed, "an installed copy the owner changed")
  const shown = captureStreams()
  await createProgram({ streams: shown, env: { ...process.env, HOME: home } }).parseAsync(
    ["skill", "show", "--for", "claude"],
    { from: "user" },
  )
  expect(shown.stdout.join("")).toContain("an installed copy the owner changed")
})

it("installs the skill on a global npm install only when asked", () => {
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
  const unasked = install({ npm_config_global: "true" })
  expect(unasked).toMatchObject({ claude: false, agents: false })
  expect(unasked.notes.join("\n")).toContain("memo skill install --for all")
  expect(install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "all" })).toMatchObject({
    claude: true,
    agents: true,
  })
  expect(install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "codex" })).toMatchObject({
    claude: false,
    agents: true,
  })
  expect(install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "none" })).toMatchObject({ claude: false })
  expect(install({})).toMatchObject({ claude: false, agents: false })
  expect(() => install({ npm_config_global: "true", MEMO_INSTALL_AGENT: "vim" })).toThrow(/MEMO_INSTALL_AGENT/)
})

it("answers skill show, install and status in JSON with --json", async () => {
  const home = mkdtempSync(join(tmpdir(), "memo-skill-json-"))
  const env = { ...process.env, HOME: home }
  const json = async (argv: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).parseAsync(argv, { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }

  expect(await json(["skill", "show", "--json"])).toMatchObject({ item: { name: "cli-memo" }, meta: {} })
  expect(await json(["skill", "install", "--for", "claude", "--json"])).toMatchObject({
    item: { version: VERSION },
    meta: {},
  })
  expect(await json(["skill", "status", "--json"])).toMatchObject({
    item: {
      name: "cli-memo",
      targets: expect.arrayContaining([
        { target: "claude", path: expect.any(String), installed: VERSION, state: "current" },
      ]),
    },
    meta: {},
  })
})
