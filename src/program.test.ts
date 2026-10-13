import { readFileSync } from "node:fs"
import { captureStreams } from "@wirecat/cli-base"
import { parseCommandsDocument } from "@wirecat/cli-base/commands"
import { describe, expect, it } from "vitest"
import { createProgram, refuseJoinedPath } from "./program.js"

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

  it.each([[[]], [["tags", "add"]]])("prints a commands document in cli-base's shape for %j", async (path) => {
    const streams = captureStreams()
    await createProgram({ streams }).parseAsync(["commands", ...path, "--json"], { from: "user" })
    expect(parseCommandsDocument(JSON.parse(streams.stdout.join(""))).problems).toBeUndefined()
  })

  it("refuses an unknown command path", async () => {
    await expect(
      createProgram({ streams: captureStreams() }).parseAsync(["commands", "nope"], { from: "user" }),
    ).rejects.toMatchObject({ code: "not_found" })
  })
})

describe("a command path given as one argument", () => {
  const check =
    (...args: string[]) =>
    () =>
      refuseJoinedPath(createProgram(), args)

  it("names the words to split instead of printing the root help", () => {
    expect(check("projects add", "--help")).toThrow(
      expect.objectContaining({
        code: "validation_error",
        message: expect.stringContaining('"projects add" was given as one argument; run: memo projects add'),
      }),
    )
    expect(check("tags", "add work", "--help")).toThrow(/run: memo tags add work/)
  })

  it("leaves a command path in separate words and quoted values alone", () => {
    expect(check("projects", "add", "--help")).not.toThrow()
    expect(check("facts", "add", "two words", "--type", "fact")).not.toThrow()
    expect(check("search", "all", "budget review")).not.toThrow()
    expect(check("nothing here")).not.toThrow()
  })
})
