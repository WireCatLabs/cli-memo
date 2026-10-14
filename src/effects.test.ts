import { metaOf } from "@wirecat/cli-base/commands"
import { describe, expect, it } from "vitest"
import { EFFECTS } from "./effects.js"
import { leaves } from "./examples.js"
import { createProgram } from "./program.js"

describe("command effects", () => {
  it("are declared for every command, and only for commands that exist", () => {
    const commands = leaves(createProgram())

    expect(commands.filter(([, command]) => metaOf(command).effects === undefined).map(([path]) => path)).toEqual([])
    expect(Object.keys(EFFECTS).filter((path) => !commands.some(([at]) => at === path))).toEqual([])
  })

  it("never claim a remote write: memo only reads the mail server and the model", () => {
    expect(Object.entries(EFFECTS).filter(([, effects]) => effects.remote === "write")).toEqual([])
  })
})
