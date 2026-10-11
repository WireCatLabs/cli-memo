import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { createProgram } from "./program.js"

const packaged = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

describe("memo", () => {
  it("prints the version in package.json", async () => {
    let out = ""
    const program = createProgram()
      .exitOverride()
      .configureOutput({ writeOut: (text) => (out += text) })
    await expect(program.parseAsync(["--version"], { from: "user" })).rejects.toMatchObject({
      code: "commander.version",
    })
    expect(out.trim()).toBe(packaged)
  })
})
