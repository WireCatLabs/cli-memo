import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { commandCaller } from "../test/mcp.js"
import type { Terminal } from "./author.js"
import { configPath } from "./config.js"
import { createMemoServer } from "./mcp/server.js"
import { createProgram } from "./program.js"

const CLAUDE = { AI_AGENT: "claude-code_2-1-296_agent" }
const CODEX = { AI_AGENT: "codex" }
const NOBODY: Terminal = { present: false }

const setUp = async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-decide-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-decide-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const note = await store.notes.addNote({ text: "Synthetic evidence" })
  await store.accounts.saveAccount({ provider: "telegram", account: "1" }, { name: null })
  await store.close()
  const run = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) => {
    const streams = captureStreams()
    try {
      await createProgram({ streams, env: { ...env, ...agent }, terminal })
        .exitOverride()
        .parseAsync([...args, "--json"], { from: "user" })
      return answerOf(streams.stdout.join(""))
    } catch (error) {
      return { error }
    }
  }
  const proposeFact = async (agent: Record<string, string>) =>
    (
      await run(
        agent,
        NOBODY,
        "facts",
        "add",
        "Releases go out on Fridays",
        "--kind",
        "decision",
        "--evidence",
        note.ref,
      )
    ).ref as string
  return { env, note, run, proposeFact }
}

const refused = (reason: string) => ({
  error: expect.objectContaining({ details: expect.objectContaining({ reason }) }),
})

it("refuses an agent confirming or rejecting its own proposal through the CLI", async () => {
  const { run, proposeFact, note } = await setUp()
  const fact = await proposeFact(CLAUDE)
  expect(await run(CLAUDE, NOBODY, "facts", "confirm", fact, "--reason", "it is right")).toMatchObject(
    refused("proposal.own"),
  )
  expect(await run(CLAUDE, NOBODY, "facts", "reject", fact, "--reason", "it is wrong")).toMatchObject(
    refused("proposal.own"),
  )
  const memory = await run(
    CLAUDE,
    NOBODY,
    ...["memories", "add", "Prefers short replies", "--kind", "preference", "--scope", "work", "--evidence", note.ref],
  )
  expect(await run(CLAUDE, NOBODY, "memories", "confirm", memory.ref, "--reason", "checked")).toMatchObject(
    refused("proposal.own"),
  )
  const action = await run(CLAUDE, NOBODY, "actions", "add", "reply", "--reason", "asked", "--account", "telegram:1")
  expect(action).toMatchObject({ status: "proposed" })
  expect(await run(CLAUDE, NOBODY, "actions", "confirm", action.id, "--reason", "fine")).toMatchObject(
    refused("proposal.own"),
  )
})

it("lets another agent decide with a reason, and refuses every agent when agent_decisions is false", async () => {
  const { env, run, proposeFact } = await setUp()
  const first = await proposeFact(CLAUDE)
  expect(await run(CODEX, NOBODY, "facts", "confirm", first)).toMatchObject(refused("proposal.reason-required"))
  expect(await run(CODEX, NOBODY, "facts", "confirm", first, "--reason", "the thread says so")).toMatchObject({
    status: "accepted",
  })

  const second = await proposeFact(CLAUDE)
  mkdirSync(dirname(configPath(env)), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify({ agent_decisions: false }))
  expect(await run(CODEX, NOBODY, "facts", "confirm", second, "--reason", "the thread says so")).toMatchObject(
    refused("proposals.agent-decisions-off"),
  )
  expect(await run({}, { present: true }, "facts", "confirm", second)).toMatchObject({ status: "accepted" })
})

it("takes the owner only at a terminal, and --as-owner from an agent's terminal only after a yes", async () => {
  const { env, run, proposeFact } = await setUp()
  const fact = await proposeFact(CLAUDE)
  expect(await run({}, NOBODY, "facts", "confirm", fact)).toMatchObject(refused("decision.decider-unknown"))
  expect(await run(CLAUDE, NOBODY, "facts", "confirm", fact, "--as-owner")).toMatchObject(
    refused("decision.owner-unconfirmed"),
  )
  const asked: string[] = []
  const say = (answer: string): Terminal => ({
    present: true,
    answer: (question) => {
      asked.push(question)
      return answer
    },
  })
  // --json never asks: a harness that hands an agent a terminal would wait for ever.
  expect(await run(CLAUDE, say("y"), "facts", "confirm", fact, "--as-owner")).toMatchObject(
    refused("decision.owner-unconfirmed"),
  )
  expect(asked).toEqual([])

  const decide = async (answer: string) => {
    await createProgram({ streams: captureStreams(), env: { ...env, ...CLAUDE }, terminal: say(answer) })
      .exitOverride()
      .parseAsync(["facts", "confirm", fact, "--as-owner"], { from: "user" })
      .catch((error: unknown) => ({ error }))
    return (await run({}, NOBODY, "facts", "show", fact)).status
  }
  await expect(decide("n")).resolves.toBe("proposed")
  await expect(decide("y")).resolves.toBe("accepted")
  expect(asked).toEqual(["confirm fact:1 as you, the owner? [y/N] ", "confirm fact:1 as you, the owner? [y/N] "])
})

it("records a write from an unattended run as a proposal, not the owner's", async () => {
  const { run, note } = await setUp()
  const fact = await run({}, NOBODY, "facts", "add", "Kickoff moved", "--kind", "decision", "--evidence", note.ref)
  expect(fact).toMatchObject({ status: "proposed", author: { type: "bot" } })
  const owned = await run(
    {},
    { present: true },
    "facts",
    "add",
    "Kickoff moved",
    "--kind",
    "decision",
    "--evidence",
    note.ref,
  )
  expect(owned).toMatchObject({ status: "accepted", author: { type: "person" } })
})

it("refuses an MCP client confirming its own proposal, and --as-owner is not offered over MCP", async () => {
  const { env, note } = await setUp()
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(server)
  const client = new Client({ name: "synthetic-agent", version: "1" })
  await client.connect(transport)
  try {
    const call = await commandCaller(client)
    const added = await call("facts add", {
      statement: ["Releases", "go", "out", "on", "Fridays"],
      kind: "decision",
      evidence: [note.ref],
    })
    const fact = (added.structuredContent as { item: { ref: string; status: string } }).item
    expect(fact.status).toBe("proposed")
    const confirmed = await call("facts confirm", { ref: fact.ref, reason: "it is right" })
    expect(confirmed.isError).toBe(true)
    expect(confirmed.structuredContent).toMatchObject({ error: { reason: "proposal.own" } })
    const schema = await client.callTool({ name: "memo_tools_search", arguments: { query: "facts confirm" } })
    expect(JSON.stringify(schema.structuredContent)).not.toContain("as_owner")
  } finally {
    await client.close()
  }
})
