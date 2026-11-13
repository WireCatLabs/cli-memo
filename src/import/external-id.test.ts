import { describe, expect, it } from "vitest"
import { idOfPath, pathOfId } from "./external-id.js"

const ALLOWED = /^[A-Za-z0-9._~-]{1,200}$/

describe("idOfPath", () => {
  it("keeps plain names and reads every other one back", () => {
    expect(idOfPath("notes/plan-2.md")).toBe("notes~2Fplan-2.md")
    for (const path of ["notes/plan-2.md", "Встречи/звонок 1.txt", "a~b/c d.md", "emoji 🙂.md"]) {
      expect(idOfPath(path)).toMatch(ALLOWED)
      expect(pathOfId(idOfPath(path))).toBe(path)
    }
  })

  it("never gives two paths one id", () => {
    expect(idOfPath("a/b")).not.toBe(idOfPath("a~2Fb"))
    expect(idOfPath("a b")).not.toBe(idOfPath("a~20b"))
  })

  it("gives a name macOS decomposed the id of the same name composed", () => {
    expect(idOfPath("café.md".normalize("NFD"))).toBe(idOfPath("café.md".normalize("NFC")))
  })

  it("shortens a long path with a hash of the whole of it", () => {
    const deep = `${"папка/".repeat(20)}файл.md`
    const id = idOfPath(deep)
    expect(id).toMatch(ALLOWED)
    expect(id).toMatch(/~~[0-9a-f]{16}$/)
    expect(idOfPath(`${deep}x`)).not.toBe(id)
    expect(pathOfId(id)).toBeUndefined()
  })
})
