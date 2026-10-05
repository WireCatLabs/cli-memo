import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { findNotes } from "./read.js"

const vault = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "vault-"))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe("findNotes", () => {
  it("finds the note about a person by file name or alias, and the notes that link them", () => {
    const root = vault({
      "people/Rin Example.md": "---\naliases: [Rinny]\n---\nSynthetic person.\n",
      "daily/2026-01-02.md": "Lunch with [[Rinny|Rin]].\nNothing else.\n",
      "projects/alpha.md": "Owner: [[people/Rin Example#Work]]\n",
    })

    const answer = findNotes([root], "rin example")

    expect(answer.about.map((note) => note.path)).toEqual([join(root, "people/Rin Example.md")])
    expect(answer.about[0]?.aliases).toEqual(["Rinny"])
    expect(answer.links.map((item) => item.locator).sort()).toEqual([
      `note:${join(root, "daily/2026-01-02.md")}#L1`,
      `note:${join(root, "projects/alpha.md")}#L1`,
    ])
    expect(answer.weak).toEqual([])
    expect(answer.complete).toBe(true)
  })

  it("labels a plain-name mention weak and does not match inside another word", () => {
    const root = vault({
      "a.md": "Called Kai Sample about the plan.\nKai Samples is a different word.\n",
    })

    const answer = findNotes([root], "Kai Sample")

    expect(answer.links).toEqual([])
    expect(answer.weak.map(({ line, text }) => ({ line, text }))).toEqual([
      { line: 1, text: "Called Kai Sample about the plan." },
    ])
  })

  it("skips hidden folders such as .obsidian and the front matter of other notes", () => {
    const root = vault({
      ".obsidian/workspace.md": "Lea Mock\n",
      "b.md": "---\ntitle: Lea Mock\n---\nbody\n",
    })

    expect(findNotes([root], "Lea Mock").weak).toEqual([])
  })

  it("reports a folder it cannot read and still answers from the rest", () => {
    const root = vault({ "c.md": "[[Ode Fake]]\n" })

    const answer = findNotes([join(root, "missing"), root], "Ode Fake")

    expect(answer.links).toHaveLength(1)
    expect(answer.complete).toBe(false)
    expect(answer.notRead).toEqual([{ folder: join(root, "missing"), reason: expect.stringContaining("ENOENT") }])
  })

  it("keeps the newest mentions within the limit and says more exist", () => {
    const root = vault({ "d.md": "[[Ivo Test]]\n[[Ivo Test]]\n[[Ivo Test]]\n" })

    const answer = findNotes([root], "Ivo Test", 2)

    expect(answer.links).toHaveLength(2)
    expect(answer.hasMore).toBe(true)
  })
})

describe("memo notes about", () => {
  const run = async (args: string[], env: NodeJS.ProcessEnv = process.env) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }

  it("reads the folders from the config when none are given", async () => {
    const root = vault({ "Mia Fixture.md": "x\n" })
    const config = process.env.MEMO_CONFIG_DIR ?? ""
    mkdirSync(config, { recursive: true })
    writeFileSync(join(config, "config.json"), JSON.stringify({ notes: { folders: [root] } }))

    const answer = JSON.parse(await run(["notes", "about", "Mia Fixture", "--json"]))

    expect(answer.about).toHaveLength(1)
  })

  it("says how to set folders when there are none", async () => {
    const empty = mkdtempSync(join(tmpdir(), "config-"))

    const text = await run(["notes", "about", "Nobody"], { ...process.env, MEMO_CONFIG_DIR: empty })

    expect(text).toContain("pass --folder or set notes.folders")
  })

  it("prints links and weak mentions as text", async () => {
    const root = vault({ "e.md": "See [[Zed Sample]].\nZed Sample again.\n" })

    const text = await run(["notes", "about", "Zed Sample", "--folder", root])

    expect(text).toContain(`${join(root, "e.md")}:1  See [[Zed Sample]].`)
    expect(text).toContain("Plain-name mentions (weak")
  })
})
