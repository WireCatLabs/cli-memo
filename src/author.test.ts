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
  await store.saveAccount({ provider: "telegram", account: "1" }, { name: null })
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
  const organization = await run("organizations", "add", "Synthetic Studio", "--kind", "company")
  const writes = (...by: string[]) =>
    Promise.all([
      run("facts", "add", "Releases go out on Fridays", "--type", "decision", "--evidence", note.ref, ...by),
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
      run("actions", "add", "reply", "--reason", "asked", "--provider", "telegram", ...by),
    ])
  return { run, writes }
}

it("records a write made in an agent's terminal as the agent's, waiting for the owner", async () => {
  const { run, writes } = await setUp({ AI_AGENT: "claude-code_2-1-296_agent" })
  const [fact, memory, relation, action] = await writes()

  expect(fact).toMatchObject({ status: "proposed", author: { type: "bot" } })
  expect(memory).toMatchObject({ status: "proposed", author: { type: "bot" } })
  expect(relation).toMatchObject({ confirmed: false, provenance: "agent:claude-code" })
  expect(action).toMatchObject({ status: "proposed", proposed_by: { type: "bot" } })
  expect(fact.author.id).toBe(memory.author.id)
  expect(action.proposed_by.id).toBe(fact.author.id)
  expect((await run("facts", "list", "--status", "proposed")).items).toMatchObject([{ ref: fact.ref }])
})

it("names Claude Code when only CLAUDECODE says an agent runs", async () => {
  const { writes } = await setUp({ CLAUDECODE: "1" })
  const [, , relation] = await writes()
  expect(relation).toMatchObject({ confirmed: false, provenance: "agent:claude-code" })
})

it("keeps a write the owner's when they say so in an agent's terminal, and when no agent runs", async () => {
  for (const [agent, by] of [
    [{ CLAUDECODE: "1" }, ["--as-owner"]],
    [{}, []],
  ] as const) {
    const { writes } = await setUp(agent)
    const [fact, memory, relation, action] = await writes(...by)
    expect(fact).toMatchObject({ status: "accepted", author: { type: "person" } })
    expect(memory).toMatchObject({ status: "confirmed", author: { type: "person" } })
    expect(relation).toMatchObject({ confirmed: true, confidence_category: "owner-confirmed" })
    expect(action.proposed_by).toMatchObject({ type: "person" })
  }
})
