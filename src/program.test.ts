import { readFileSync } from "node:fs"
import { captureStreams } from "@wirecat/cli-base"
import { describeProgram, flatten, parseCommandsDocument } from "@wirecat/cli-base/commands"
import type { Command } from "commander"
import { describe, expect, it } from "vitest"
import { CONTRACT } from "./discovery/command.js"
import { throwParseFailures } from "./failure.js"
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

  it("lists mcp serve as persistent, since it serves until stdin closes", async () => {
    const streams = captureStreams()
    await createProgram({ streams }).parseAsync(["commands", "mcp", "serve", "--json"], { from: "user" })
    expect(JSON.parse(streams.stdout.join("")).commands).toMatchObject([{ name: "serve", lifetime: "persistent" }])
  })

  it("lists commands as text by section without --json, one group with a path", async () => {
    const streams = captureStreams()
    await createProgram({ streams }).parseAsync(["commands"], { from: "user" })
    const text = streams.stdout.join("")
    expect(text).toMatch(/^memo commands, by section\./)
    expect(text).toMatch(/\nWrite\n {2}memo notes add /)
    expect(text).toMatch(/\nAutomate\n(?: {2}.*\n)* {2}memo sync /)
    expect(text).not.toContain("\nOther\n")
    const scoped = captureStreams()
    await createProgram({ streams: scoped }).parseAsync(["commands", "mail"], { from: "user" })
    expect(scoped.stdout.join("")).toMatch(
      /^memo mail commands, by section\.[\s\S]*\nRead\n(?: {2}.*\n)* {2}memo mail inspect /,
    )
  })

  it("keeps its own JSON contract", async () => {
    const streams = captureStreams()
    await createProgram({ streams }).parseAsync(["commands", "--json"], { from: "user" })
    expect(JSON.parse(streams.stdout.join("")).contract).toBe(CONTRACT)
    expect(CONTRACT).toBe(4)
  })

  // Builds a whole program per command; on a shared CI runner that passes the 5 s default.
  it("prints help for every command, lists with a query included", async () => {
    const silence = (command: Command): void => {
      command.configureOutput({ writeOut: () => undefined, writeErr: () => undefined })
      for (const child of command.commands) silence(child)
    }
    const leaves = flatten(describeProgram(createProgram())).filter((command) => command.commands.length === 0)
    const failed: string[] = []
    for (const { path } of leaves) {
      const program = createProgram({ streams: captureStreams() })
      throwParseFailures(program)
      silence(program)
      const help = await program.parseAsync([...path, "--help"], { from: "user" }).catch((error: unknown) => error)
      if ((help as { code?: string }).code !== "commander.helpDisplayed") failed.push(path.join(" "))
    }
    expect(leaves.length).toBeGreaterThan(100)
    expect(failed).toEqual([])
  }, 30_000)

  it("refuses --json on the mcp group as on its other groups, instead of printing help", async () => {
    for (const group of ["mcp", "notes"]) {
      const program = createProgram({ streams: captureStreams() })
      throwParseFailures(program)
      await expect(program.parseAsync([group, "--json"], { from: "user" })).rejects.toMatchObject({
        code: "commander.unknownOption",
      })
    }
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
