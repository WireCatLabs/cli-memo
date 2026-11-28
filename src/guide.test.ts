import { fileURLToPath } from "node:url"
import { captureStreams } from "@wirecat/cli-base"
import { checkGuide, loadScenarios, MEMO_SCENARIOS, WIRECAT_TOOLS } from "@wirecat/cli-core/cli"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"

const packageRoot = fileURLToPath(new URL("..", import.meta.url))
// cli-core's tool list names files once the split lands there; its steps are checked like any other tool's.
const otherTools = [...WIRECAT_TOOLS.map(({ command }) => command), "files"].filter((command) => command !== "wcat")

it("checks every wcat step of every scenario, and ships the folder", async () => {
  const problems = await checkGuide(() => createProgram({ streams: captureStreams(), env: {} }), { packageRoot })
  // checkGuide knows only wcat's commands; a step of another tool is checked against its npm release by hand.
  const foreign = new RegExp(`\\): starts with "(${otherTools.join("|")})", not wcat$`)
  expect(problems.filter((problem) => !foreign.test(problem))).toEqual([])
})

it("holds the scenarios the other tools list under Works with, under the same titles", async () => {
  const { scenarios } = await loadScenarios(fileURLToPath(new URL("../scenarios", import.meta.url)))
  for (const { name, title } of Object.values(MEMO_SCENARIOS))
    expect(scenarios.find((scenario) => scenario.name === name)?.title).toBe(title)
})
