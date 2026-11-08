import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("sets a person's engagement and a role note on a project membership, lists them and orders the project's people", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-engagement-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(root, "store.db") }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ path: String(env.MESSAGING_STORE) })
  const people = []
  for (const name of ["Rare Sender", "Daily Lead", "Unknown Helper"]) people.push(await store.people.add({ name }))
  await store.close()
  const run = async (present: boolean, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...(present ? {} : { AI_AGENT: "codex" }) }, terminal: { present } })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const json = async (present: boolean, ...args: string[]) => envelopeOf(await run(present, ...args, "--json"))
  await json(true, "projects", "add", "Synthetic Harbour", "--key", "SYH")
  const [rare, lead, helper] = people.map((person) => `person:${person.uid}`)
  const added = await json(true, "relationships", "add", String(rare), "project:1", "--engagement", "low")
  expect(added.item).toMatchObject({ engagement: "low" })
  const daily = await json(true, "relationships", "add", String(lead), "project:1", "--role", "approver")
  await json(true, "relationships", "add", String(helper), "project:1")

  const proposed = await json(false, "relationships", "update", daily.item.id, "--engagement", "high")
  expect(proposed.item).toMatchObject({ kind: "relationship_update", payload: { changes: { engagement: "high" } } })
  const updated = await json(
    true,
    ...["relationships", "update", daily.item.id, "--engagement", "high", "--role-note", "signs the acts"],
  )
  expect(updated.item).toMatchObject({ role: "approver", role_note: "signs the acts", engagement: "high" })

  const context = await json(true, "projects", "context", "SYH")
  expect(context.item.relationships.map((link: { from: string }) => link.from)).toEqual([lead, helper, rare])
  expect(await run(true, "relationships", "list", 'about:"project:1"')).toContain(
    "member-of as approver (signs the acts) engagement high",
  )

  const cleared = await json(true, "relationships", "update", added.item.id, "--engagement", "")
  expect(cleared.item.engagement ?? null).toBeNull()
})
