import { metaOf } from "@wirecat/cli-base/commands"
import { describe, expect, it } from "vitest"
import { leaves } from "./examples.js"
import { createProgram } from "./program.js"

describe("command effects", () => {
  it("are declared for every command", () => {
    const commands = leaves(createProgram())

    expect(commands.filter(([, command]) => metaOf(command).effects === undefined).map(([path]) => path)).toEqual([])
  })

  it("never write to the mail server", () => {
    expect(
      leaves(createProgram())
        .filter(([, command]) => metaOf(command).effects?.remote === "write")
        .map(([path]) => path),
    ).toEqual([])
  })
})
