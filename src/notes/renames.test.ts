import { describe, expect, it } from "vitest"
import { detectRenames } from "./renames.js"

describe("detectRenames", () => {
  it("pairs a gone path with a new path holding the same content", () => {
    expect(detectRenames({ "a.md": "h1", "b.md": "h2" }, { "Archive/a.md": "h1", "b.md": "h2" })).toEqual([
      { from: "a.md", to: "Archive/a.md" },
    ])
  })

  it("is not a rename when the content changed too", () => {
    expect(detectRenames({ "a.md": "h1" }, { "c.md": "h9" })).toEqual([])
  })

  it("leaves out a hash that names more than one move", () => {
    expect(detectRenames({ "a.md": "same", "b.md": "same" }, { "c.md": "same", "d.md": "same" })).toEqual([])
    expect(detectRenames({ "a.md": "same" }, { "c.md": "same", "d.md": "same" })).toEqual([])
  })

  it("does not count a copy as a move", () => {
    expect(detectRenames({ "a.md": "h1" }, { "a.md": "h1", "copy.md": "h1" })).toEqual([])
  })
})
