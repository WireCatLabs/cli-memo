import { describe, expect, it } from "vitest"
import { createProgram } from "./program.js"
import { VERSION } from "./version.js"

describe("memo", () => {
  it("prints its version", async () => {
    let out = ""
    const program = createProgram()
      .exitOverride()
      .configureOutput({ writeOut: (text) => (out += text) })
    await expect(program.parseAsync(["--version"], { from: "user" })).rejects.toMatchObject({
      code: "commander.version",
    })
    expect(out.trim()).toBe(VERSION)
  })
})
