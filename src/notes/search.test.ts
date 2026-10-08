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
  env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
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
  await run("folders", "add", vault)
  await run("notes", "import")
})
describe("structured note retrieval and saved links", () => {
  it("uses shared phrase/Boolean filters, provides exact current excerpts and paginates distinct notes", async () => {
    const first = await run("search", "notes", '"budget review" AND NOT cancelled', "--limit", "2")
    expect(first.hits).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    expect(first.nextOffset).toBe(2)
    expect(first.hits.every((hit: { line: string }) => /budget review/i.test(hit.line))).toBe(true)
    const second = await run("search", "notes", '"budget review" AND NOT cancelled', "--limit", "2", "--offset", "2")
    expect(second.hits).toHaveLength(1)
    expect(second.hasMore).toBe(false)
    expect(new Set([...first.hits, ...second.hits].map((hit: { ref: string }) => hit.ref)).size).toBe(3)
    await expect(run("search", "notes", '"unfinished')).rejects.toMatchObject({ code: "validation_error" })
  })

  it("links relative paths and aliases to the note, and keeps an ambiguous or unknown name as written", async () => {
    const answer = await run("search", "notes", "agreed OR Missing")
    const review = answer.hits.find((hit: { path: string }) => hit.path === "Meetings/Review.md")
    const rin = (await run("notes", "show", join(vault, "People/Rin.md"))).ref
    expect(review.links).toHaveLength(4)
    expect(review.links).toEqual(
      expect.arrayContaining([
        { to: rin, targetText: null, kind: "links-to", anchor: "#Budget" },
        { to: rin, targetText: null, kind: "links-to", anchor: null },
        { to: null, targetText: "Rin", kind: "links-to", anchor: null },
        { to: null, targetText: "Missing", kind: "links-to", anchor: null },
      ]),
    )
  })
})
