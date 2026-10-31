import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import { type NoteHit, searchText } from "./search.js"

let vault: string, env: NodeJS.ProcessEnv
const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
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
  await run("sync", "--only", "notes")
})
describe("structured note retrieval and saved links", () => {
  it("uses shared phrase/Boolean filters, provides exact current excerpts and paginates distinct notes", async () => {
    const first = await run("search", "notes", '"budget review" AND NOT cancelled', "--limit", "2")
    expect(first.items).toHaveLength(2)
    expect(first.page).toEqual({
      mode: "page",
      limit: 2,
      has_more: true,
      next_page: 2,
      total: { value: 3, relation: "eq" },
    })
    expect(first.items.every((hit: { excerpt: string }) => /budget review/i.test(hit.excerpt))).toBe(true)
    const second = await run("search", "notes", '"budget review" AND NOT cancelled', "--limit", "2", "--page", "2")
    expect(second.items).toHaveLength(1)
    expect(second.page.has_more).toBe(false)
    expect(new Set([...first.items, ...second.items].map((hit: { ref: string }) => hit.ref)).size).toBe(3)
    await expect(run("search", "notes", '"unfinished')).rejects.toMatchObject({ code: "validation_error" })
  })

  it("links relative paths and aliases to the note, and keeps an ambiguous or unknown name as written", async () => {
    const answer = await run("search", "notes", "agreed OR Missing")
    const review = answer.items.find((hit: { path: string }) => hit.path === "Meetings/Review.md")
    const rin = (await run("notes", "show", join(vault, "People/Rin.md"))).ref
    expect(review.links).toHaveLength(4)
    expect(review.links).toEqual(
      expect.arrayContaining([
        { to: rin, target_text: null, kind: "links-to", anchor: "#Budget" },
        { to: rin, target_text: null, kind: "links-to", anchor: null },
        { to: null, target_text: "Rin", kind: "links-to", anchor: null },
        { to: null, target_text: "Missing", kind: "links-to", anchor: null },
      ]),
    )
    const shown = await run("notes", "show", rin)
    expect(shown.backlinks).toContainEqual({
      from: review.ref,
      target_text: null,
      kind: "links-to",
      anchor: "#Budget",
    })
    expect(shown.front_matter).toEqual({ aliases: ["Navigator"] })
    expect(shown).not.toHaveProperty("labels")
    expect(shown).not.toHaveProperty("provenance")
  })
})

it("labels a note found by meaning, and no other", () => {
  const hit = (path: string, found_by: NoteHit["found_by"]) =>
    ({ ref: "document:1", path, excerpt: "", found_by }) as NoteHit
  const text = searchText({
    query: "budget",
    hits: [hit("title.md", ["title"]), hit("words.md", ["words"]), hit("meaning.md", ["meaning"])],
    has_more: false,
    linked: [],
  } as unknown as Parameters<typeof searchText>[0])
  expect(text).toContain("title.md\n")
  expect(text).toContain("words.md\n")
  expect(text).toContain("meaning.md  (by meaning)")
})
