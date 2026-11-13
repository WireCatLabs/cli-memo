import { captureStreams } from "@wirecat/cli-base"
import { ownCatalogue } from "@wirecat/cli-core/testing"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"
import { MCP_EXCLUSIONS } from "./catalogue.js"

it("pins memo's own commands over MCP and whether each reads or writes", async () => {
  const program = createProgram({ env: process.env, streams: captureStreams() })
  const catalogue = ownCatalogue(program, { exclude: MCP_EXCLUSIONS.map(({ path }) => path) })
  await expect(`${JSON.stringify(catalogue, null, 2)}\n`).toMatchFileSnapshot("../../contracts/mcp-catalogue.json")
})
