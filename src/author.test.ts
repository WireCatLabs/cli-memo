import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { createProgram } from "./program.js"

const setUp = async (agent: Record<string, string>) => {
  const env = { ...process.env, ...agent, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-author-")), "s.db") }
  const store = await openStore({ env })
  await store.accounts.saveAccount({ provider: "telegram", account: "1" }, { name: null })
  const organization = await store.knowledge.addOrganization({ kind: "company", name: "Synthetic Studio" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const note = await run("notes", "add", "Synthetic note")
  const project = await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  const writes = (...by: string[]) =>
    Promise.all([
      run("facts", "add", "Releases go out on Fridays", "--kind", "decision", "--evidence", note.ref, ...by),
      run(
        "memories",
        "add",
        "Prefers short replies",
        "--kind",
        "preference",
        "--scope",
        "work",
        "--evidence",
        note.ref,
        ...by,
      ),
      run("relationships", "add", project.ref, organization.ref, "--kind", "related-to", ...by),
      run("actions", "add", "reply", "--reason", "asked", "--account", "telegram:1", ...by),
    ])
  return { run, writes }
}

it("records a write made in an agent's terminal as the agent's, waiting for the owner", async () => {
  const { run, writes } = await setUp({ AI_AGENT: "claude-code_2-1-296_agent" })
  const [fact, memory, relation, action] = await writes()

  expect(fact).toMatchObject({ status: "proposed", author: { type: "bot" } })
  expect(memory).toMatchObject({ status: "proposed", author: { type: "bot" } })
  expect(relation).toMatchObject({ kind: "relationship", status: "proposed", proposed_by: { type: "bot" } })
  expect(action).toMatchObject({ status: "proposed", proposed_by: { type: "bot" } })
  expect(fact.author.id).toBe(memory.author.id)
  expect(action.proposed_by.id).toBe(fact.author.id)
  expect((await run("facts", "list", "status:proposed")).items).toMatchObject([{ ref: fact.ref }])
})

it("names Claude Code when only CLAUDECODE says an agent runs", async () => {
  const { writes } = await setUp({ CLAUDECODE: "1" })
  const [fact, , relation] = await writes()
  expect(relation).toMatchObject({ status: "proposed", proposed_by: { id: fact.author.id } })
})

it("keeps a write the owner's when no agent runs and the owner is at the terminal", async () => {
  const { writes } = await setUp({})
  const [fact, memory, relation, action] = await writes()
  expect(fact).toMatchObject({ status: "accepted", author: { type: "person" } })
  expect(memory).toMatchObject({ status: "confirmed", author: { type: "person" } })
  expect(relation).toMatchObject({ confirmed: true, confidence_category: "owner-confirmed" })
  expect(action.proposed_by).toMatchObject({ type: "person" })
})

it("adds an organization from an agent's terminal at once, as for the owner", async () => {
  const agent = await setUp({ AI_AGENT: "claude-code_2-1-296_agent" })
  expect(await agent.run("organizations", "add", "Synthetic Dairy", "--kind", "company")).toMatchObject({
    ref: expect.stringMatching(/^organization:/),
    name: "Synthetic Dairy",
  })
  expect((await agent.run("organizations", "list")).items.map((row: { name: string }) => row.name)).toContain(
    "Synthetic Dairy",
  )
})

it("renames an organization from an agent's terminal at once, as for the owner", async () => {
  const agent = await setUp({ AI_AGENT: "claude-code_2-1-296_agent" })
  expect(await agent.run("organizations", "rename", "organization:1", "Synthetic Farm")).toMatchObject({
    name: "Synthetic Farm",
  })
  await expect(agent.run("organizations", "rename", "organization:999", "X")).rejects.toMatchObject({
    code: "not_found",
  })

  const owner = await setUp({})
  expect(await owner.run("organizations", "rename", "1", "Тартус")).toMatchObject({ name: "Тартус" })
  expect((await owner.run("organizations", "list", "name:*ТАРТ*")).items).toHaveLength(1)
  expect((await owner.run("organizations", "list", "name:*studio*")).items).toHaveLength(0)
})
