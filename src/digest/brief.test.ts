import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"
import { BRIEF_LIMIT } from "./brief.js"

const fixture = (extra: NodeJS.ProcessEnv = {}) => {
  const root = mkdtempSync(join(tmpdir(), "memo-brief-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "store.db"), MEMO_STATE_DIR: join(root, "state"), ...extra }
  let streams = captureStreams()
  const run = (...args: string[]) => {
    streams = captureStreams()
    return createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  }
  const file = (name: string, text: string) => {
    const path = join(root, name)
    writeFileSync(path, text)
    return path
  }
  return { run, file, out: () => streams.stdout.join("") }
}

const skill = async (run: (...args: string[]) => Promise<unknown>, out: () => string) => {
  await run("skill", "show", "morning-digest")
  return out()
}

it("ends the morning-digest skill with the owner's brief, and leaves it unchanged without one", async () => {
  const { run, file, out } = fixture()
  const without = await skill(run, out)
  expect(without).not.toContain("The owner's brief")

  await run("digest", "brief", "edit", "--file", file("brief.md", "Always list Project Falcon first.\n"))
  const withIt = await skill(run, out)

  expect(withIt.startsWith(without.trimEnd())).toBe(true)
  expect(withIt).toMatch(/## The owner's brief\n\n.*the brief wins\.\n\nAlways list Project Falcon first\.$/)
  await run("skill", "show", "morning-digest", "--json")
  expect(JSON.parse(out()).item.content).toContain("Always list Project Falcon first.")
  await run("skill", "show", "mail-triage")
  expect(out()).not.toContain("Project Falcon")
})

it("answers an edit and a reset in JSON with what they changed", async () => {
  const { run, file, out } = fixture()
  await run("digest", "brief", "edit", "--file", file("b.md", "Synthetic brief"), "--json")
  expect(JSON.parse(out()).item).toMatchObject({ changed: true, chars: 15, limit: BRIEF_LIMIT })
  await run("digest", "brief", "reset", "--json")
  expect(JSON.parse(out()).item).toMatchObject({ changed: true })
  await run("digest", "brief", "show", "--json")
  expect(JSON.parse(out()).item.body).toBeNull()
})

it("shows the brief with its history, puts back the previous one with --undo, and removes it with reset", async () => {
  const { run, file, out } = fixture()
  await run("digest", "brief", "edit", "--file", file("one.md", "First brief"))
  await run("digest", "brief", "edit", "--file", file("two.md", "Second brief"))

  await run("digest", "brief", "show", "--json")
  expect(JSON.parse(out()).item).toMatchObject({ body: "Second brief", limit: BRIEF_LIMIT, history: [{ chars: 11 }] })

  await run("digest", "brief", "edit", "--undo")
  await run("digest", "brief", "show", "--json")
  expect(JSON.parse(out()).item.body).toBe("First brief")

  await run("digest", "brief", "reset")
  await run("digest", "brief", "show", "--json")
  expect(JSON.parse(out()).item.body).toBeNull()
  expect(await skill(run, out)).not.toContain("The owner's brief")
})

it("writes the brief in the editor", async () => {
  const script = join(mkdtempSync(join(tmpdir(), "memo-editor-")), "editor.mjs")
  writeFileSync(script, 'import { writeFileSync } from "node:fs"\nwriteFileSync(process.argv[2], "From the editor")\n')
  const { run, out } = fixture({ EDITOR: `node ${script}` })
  await run("digest", "brief", "edit")
  await run("digest", "brief", "show")
  expect(out()).toContain("From the editor")
})

it("refuses a brief over the limit and saves nothing", async () => {
  const { run, file, out } = fixture()
  await expect(
    run("digest", "brief", "edit", "--file", file("long.md", "x".repeat(BRIEF_LIMIT + 1))),
  ).rejects.toMatchObject({ code: "validation_error", message: expect.stringContaining(`limit is ${BRIEF_LIMIT}`) })
  await run("digest", "brief", "show", "--json")
  expect(JSON.parse(out()).item.body).toBeNull()
})

it("refuses a change from an agent and under MEMO_READ_ONLY, and still shows the brief", async () => {
  const agent = fixture({ AI_AGENT: "claude-code" })
  await expect(agent.run("digest", "brief", "edit", "--file", agent.file("b.md", "x"))).rejects.toMatchObject({
    code: "permission_error",
    message: expect.stringContaining("only the owner"),
  })
  await expect(agent.run("digest", "brief", "reset")).rejects.toMatchObject({ code: "permission_error" })

  const locked = fixture({ MEMO_READ_ONLY: "1" })
  await expect(locked.run("digest", "brief", "edit", "--file", locked.file("b.md", "x"))).rejects.toMatchObject({
    code: "permission_error",
    message: expect.stringContaining("MEMO_READ_ONLY"),
  })
  await locked.run("digest", "brief", "show")
  expect(locked.out()).toContain("No brief")
})
