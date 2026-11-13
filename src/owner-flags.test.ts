import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { beforeAll, describe, expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { updateConfig } from "./config.js"
import { createProgram } from "./program.js"
import type { Terminal } from "./terminal.js"

const CLAUDE = { AI_AGENT: "claude-code_2-1-296_agent" }
const NOBODY: Terminal = { present: false }
const OWNER: Terminal = { present: true }

const quiet = (command: Command): Command => {
  command.exitOverride()
  command.configureOutput({ writeErr: () => {} })
  for (const child of command.commands) quiet(child)
  return command
}

let env: NodeJS.ProcessEnv
let note: string

const run = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) => {
  const streams = captureStreams()
  try {
    await quiet(createProgram({ streams, env: { ...env, ...agent }, terminal })).parseAsync([...args, "--json"], {
      from: "user",
    })
    return answerOf(streams.stdout.join(""))
  } catch (error) {
    return { error }
  }
}
const agent = (...args: string[]) => run(CLAUDE, NOBODY, ...args)
const owner = (...args: string[]) => run({}, OWNER, ...args)
const fromApp = (...args: string[]) => run(CLAUDE, NOBODY, ...args, "--from-app")
const asOwner = (...args: string[]) => run(CLAUDE, NOBODY, ...args, "--as-owner")

const refused = (reason: string) => ({
  error: expect.objectContaining({ details: expect.objectContaining({ reason }) }),
})
const UNCONFIRMED = refused("decision.owner-unconfirmed")

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-owner-flags-"))
  env = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  updateConfig((config) => ({ ...config, agent_decisions: true }), env)
  const store = await openStore({ env })
  note = (await store.notes.addNote({ text: "Synthetic evidence" })).ref
  await store.accounts.saveAccount({ provider: "telegram", account: "1" }, { name: null })
  await store.close()
})

describe("facts", () => {
  const propose = async (statement = "Releases go out on Fridays") =>
    (await agent("facts", "add", statement, "--kind", "decision", "--evidence", note)).ref as string

  it("records the owner's fact under --from-app, and an agent's --as-owner asks a terminal nobody is at", async () => {
    expect(await asOwner("facts", "add", "Kickoff moved", "--kind", "decision", "--evidence", note)).toMatchObject(
      UNCONFIRMED,
    )
    expect(
      await fromApp("facts", "add", "Kickoff moved", "--kind", "fact", "--scope", "work", "--evidence", note),
    ).toMatchObject({ status: "accepted", origin: "owner", scope: "work" })
  })

  it("lets --from-app reject, revoke, reverse and remove, and refuses each --as-owner with nobody at the terminal", async () => {
    const rejected = await propose()
    expect(await asOwner("facts", "reject", rejected)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("facts", "reject", rejected)).toMatchObject({ status: "rejected" })

    const confirmed = await propose()
    expect(await fromApp("facts", "confirm", confirmed)).toMatchObject({ status: "accepted" })
    expect(await asOwner("facts", "revoke", confirmed)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("facts", "revoke", confirmed)).toMatchObject({ status: "proposed" })

    const decided = await owner("facts", "add", "Kickoff is on Monday", "--kind", "decision")
    expect(await asOwner("facts", "reverse", decided.ref)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("facts", "reverse", decided.ref)).toMatchObject({ status: "reversed" })

    expect(await asOwner("facts", "remove", decided.ref)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("facts", "remove", decided.ref)).not.toHaveProperty("error")
  })

  it("keeps reverse and remove the owner's, even for an agent that gives --reason", async () => {
    const decided = await owner("facts", "add", "Demo moves to Tuesday", "--kind", "decision")
    expect(await agent("facts", "reverse", decided.ref)).toMatchObject(refused("proposal.reason-required"))
    expect(await agent("facts", "reverse", decided.ref, "--reason", "the thread cancels it")).toMatchObject(
      refused("proposal.owner-only"),
    )
    expect(await agent("facts", "remove", decided.ref, "--reason", "recorded twice")).toMatchObject(
      refused("proposal.owner-only"),
    )
    expect(await owner("facts", "show", decided.ref)).toMatchObject({ status: "accepted" })
  })

  // The command takes --reason but never passes it to the store, so the owner's reason is not kept with the decision.
  it.todo("facts reverse and facts remove keep the owner's --reason with the decision")

  it("opens a challenge as the owner under --from-app; --as-owner asks first", async () => {
    const fact = await owner("facts", "add", "Office closes at six", "--kind", "statement")
    const args = ["facts", "challenge", fact.ref, "--evidence", note, "--reason", "it closes at seven now"]
    expect(await asOwner(...args)).toMatchObject(UNCONFIRMED)
    expect(await fromApp(...args)).toMatchObject({ status: "proposed" })
  })
})

describe("memories", () => {
  const MEMORY = ["Prefers short replies", "--kind", "preference", "--scope", "work", "--evidence"]
  const proposedByAnotherAgent = async () =>
    (await run({ AI_AGENT: "codex" }, NOBODY, "memories", "add", ...MEMORY, note)).ref as string

  it("records the owner's memory under --from-app, and an agent's --as-owner asks a terminal nobody is at", async () => {
    expect(await asOwner("memories", "add", ...MEMORY, note)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("memories", "add", ...MEMORY, note)).toMatchObject({
      status: "confirmed",
      author: { type: "person" },
    })
  })

  it("decides as the owner under --from-app, and refuses each --as-owner with nobody at the terminal", async () => {
    const confirmed = (await agent("memories", "add", ...MEMORY, note)).ref as string
    expect(await asOwner("memories", "confirm", confirmed)).toMatchObject(UNCONFIRMED)

    const invalid = (await fromApp("memories", "add", ...MEMORY, note)).ref as string
    expect(await asOwner("memories", "invalidate", invalid)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("memories", "invalidate", invalid)).toMatchObject({ status: "stale" })

    expect(await asOwner("memories", "remove", invalid)).toMatchObject(UNCONFIRMED)
    expect(await fromApp("memories", "remove", invalid)).not.toHaveProperty("error")
  })

  it("lets an agent invalidate another agent's memory only with --reason", async () => {
    const ref = await proposedByAnotherAgent()
    expect(await agent("memories", "invalidate", ref)).toMatchObject(refused("proposal.reason-required"))
    expect(await agent("memories", "invalidate", ref, "--reason", "the thread says evenings")).not.toHaveProperty(
      "error",
    )
    expect(await agent("memories", "remove", ref)).toMatchObject(refused("proposal.reason-required"))
    expect(await agent("memories", "remove", ref, "--reason", "recorded twice")).toMatchObject(
      refused("proposal.owner-only"),
    )
  })

  it("opens a challenge as the owner under --from-app; --as-owner asks first", async () => {
    const memory = (await fromApp("memories", "add", ...MEMORY, note)).ref as string
    const args = ["memories", "challenge", memory, "--evidence", note, "--reason", "prefers long replies now"]
    expect(await asOwner(...args)).toMatchObject(UNCONFIRMED)
    expect(await fromApp(...args)).toMatchObject({ status: "proposed" })
  })
})
