import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { beforeEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"

let vault: string, env: NodeJS.ProcessEnv
const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--json"], { from: "user" })
  return JSON.parse(streams.stdout.join(""))
}
beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-search-"))
  vault = join(root, "vault")
  env = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
  const files = {
    "People/Rin.md": "---\naliases: [Navigator]\n---\nProject budget review.",
    "Other/Rin.md": "Different person, different budget.",
    "Meetings/Review.md": "Project budget review. [[../People/Rin#Budget]] [[Navigator]] [[Rin]] [[Missing]]",
    "Meetings/Second.md": "Project budget review agreed.",
    "Meetings/Excluded.md": "Project budget review cancelled.",
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(vault, path, ".."), { recursive: true })
    writeFileSync(join(vault, path), text)
  }
  await run("notes", "import", "--folder", vault, "--no-embed")
})
describe("structured note retrieval and scoped links", () => {
  it("uses shared phrase/Boolean filters, provides exact current excerpts and paginates distinct documents", async () => {
    const first = await run("notes", "search", '"budget review" AND NOT cancelled', "--words-only", "--limit", "2")
    expect(first.hits).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    expect(first.nextOffset).toBe(2)
    expect(first.hits.every((hit: { line: string }) => /budget review/i.test(hit.line))).toBe(true)
    const second = await run(
      "notes",
      "search",
      '"budget review" AND NOT cancelled',
      "--words-only",
      "--limit",
      "2",
      "--offset",
      "2",
    )
    expect(second.hits).toHaveLength(1)
    expect(second.hasMore).toBe(false)
    expect(new Set([...first.hits, ...second.hits].map((hit: { locator: string }) => hit.locator)).size).toBe(3)
    await expect(run("notes", "search", '"unfinished', "--words-only")).rejects.toMatchObject({
      code: "validation_error",
    })
  })
  it("resolves relative paths and aliases while preserving ambiguous basenames and anchors", async () => {
    const answer = await run("notes", "search", "agreed OR Missing", "--words-only")
    const review = answer.hits.find((hit: { path: string }) => hit.path === "Meetings/Review.md")
    expect(review.links).toEqual([
      { target: "../People/Rin", anchor: "#Budget", status: "resolved", paths: ["People/Rin.md"] },
      { target: "Navigator", anchor: null, status: "resolved", paths: ["People/Rin.md"] },
      { target: "Rin", anchor: null, status: "ambiguous", paths: ["Other/Rin.md", "People/Rin.md"] },
      { target: "Missing", anchor: null, status: "unresolved", paths: [] },
    ])
  })
})
