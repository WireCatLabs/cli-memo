import { readFileSync } from "node:fs"
import { captureStreams } from "@wirecat/cli-core"
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

  it("lists its command tree for documentation and agents", async () => {
    const streams = captureStreams()
    await createProgram({ streams }).parseAsync(["commands", "--json"], { from: "user" })
    const answer = JSON.parse(streams.stdout.join(""))
    expect(answer.cli).toBe("memo")
    expect(answer.commands.map((command: { name: string }) => command.name)).toContain("notes")
  })

  it("refuses an unknown command path", async () => {
    await expect(
      createProgram({ streams: captureStreams() }).parseAsync(["commands", "nope"], { from: "user" }),
    ).rejects.toMatchObject({ code: "not_found" })
  })
})
