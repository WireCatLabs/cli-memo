import { fileURLToPath } from "node:url"
import { captureStreams } from "@wirecat/cli-base"
import { checkGuide, loadScenarios, WIRECAT_TOOLS } from "@wirecat/cli-core/cli"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"

const packageRoot = fileURLToPath(new URL("..", import.meta.url))
const otherTools = WIRECAT_TOOLS.map(({ command }) => command).filter((command) => command !== "memo")

it("checks every memo step of every scenario, and ships the folder", async () => {
  const problems = await checkGuide(() => createProgram({ streams: captureStreams(), env: {} }), { packageRoot })
  // checkGuide knows only memo's commands; a step of another tool is checked against its npm release by hand.
  const foreign = new RegExp(`\\): starts with "(${otherTools.join("|")})", not memo$`)
  expect(problems.filter((problem) => !foreign.test(problem))).toEqual([])
})

it("holds person-brief, the scenario the other tools list under Works with", async () => {
  const { scenarios } = await loadScenarios(fileURLToPath(new URL("../scenarios", import.meta.url)))
  expect(scenarios.find(({ name }) => name === "person-brief")).toMatchObject({
    title: "one person across every tool",
  })
})
