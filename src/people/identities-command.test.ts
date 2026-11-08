import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
import { commandCaller } from "../../test/mcp.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"

const CLAUDE = { AI_AGENT: "claude-code_2-1-296_agent" }
const NOBODY: Terminal = { present: false }
const OWNER: Terminal = { present: true }
const TG = { provider: "telegram", account: "1" }
const MAX = { provider: "max", account: "2" }

let env: NodeJS.ProcessEnv

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-people-identities-"))
  env = {
    ...process.env,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.people.savePeople(TG, [{ id: "11", name: "Rin Example", phone: "79001234567" }])
  await store.people.savePeople(MAX, [{ id: "22", name: "Rin E", phone: "+79001234567" }])
  await store.people.savePeople(MAX, [{ id: "33", name: "Kai Sample" }])
  await store.close()
})

afterEach(() => {
  process.exitCode = 0
})

const raw = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env: { ...env, ...agent }, terminal })
    .exitOverride()
    .parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}
const run = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) =>
  answerOf(await raw(agent, terminal, ...args, "--json"))

describe("memo people link", () => {
  it("links for the owner, and people show lists both identities and the merge", async () => {
    const linked = await run({}, OWNER, "people", "link", "max:33", "telegram:11")

    expect(linked).toMatchObject({ outcome: "linked" })
    const shown = await run({}, OWNER, "people", "show", "max:33")
    expect(shown.identities.map(({ identity }: { identity: string }) => identity).sort()).toEqual([
      "max:33",
      "telegram:11",
    ])
    expect(shown.merges).toMatchObject([{ method: "manual", by: "owner" }])
  })

  it("from an agent waits as a match, and only the owner confirms it in memo review", async () => {
    await expect(run(CLAUDE, NOBODY, "people", "link", "max:33", "telegram:11")).rejects.toMatchObject({
      details: { reason: "proposal.reason-required" },
    })
    const proposed = await run(CLAUDE, NOBODY, "people", "link", "max:33", "telegram:11", "--reason", "same face")
    expect(proposed).toMatchObject({ outcome: "proposed" })

    const matches = envelopeOf(await raw({}, OWNER, "people", "review", "--json"))
    expect(matches.items).toMatchObject([{ id: proposed.proposal, reason: "same face" }])
    const tried = await run(CLAUDE, NOBODY, "review", "confirm", proposed.proposal, "--reason", "looks right")
    expect(tried.refused).toMatchObject([{ reason: "proposal.owner-only" }])
    process.exitCode = 0
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(1)

    const decided = await run({}, NOBODY, "review", "confirm", proposed.proposal, "--from-app")
    expect(decided.decided).toMatchObject([{ kind: "identity_link", status: "confirmed" }])
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(2)
  })
})

describe("memo people review", () => {
  it("says has_more when --limit cuts the list, and people show names the people as they are now", async () => {
    await run(CLAUDE, NOBODY, "people", "link", "max:33", "telegram:11", "--reason", "same face")
    await run(CLAUDE, NOBODY, "people", "link", "max:33", "max:22", "--reason", "same voice")
    const page = envelopeOf(await raw({}, OWNER, "people", "review", "--limit", "1", "--json"))
    await run({}, OWNER, "people", "link", "telegram:11", "max:22")
    const now = (await run({}, OWNER, "people", "show", "telegram:11")).ref

    const shown = await run({}, OWNER, "people", "show", "max:33")

    expect(page.items).toHaveLength(1)
    expect(page.page.has_more).toBe(true)
    expect(shown.matches).toHaveLength(1)
    expect(shown.matches[0].persons).toContain(now)
  })
})

describe("the owner's separations", () => {
  it("refuse an agent's unlink and unmerge", async () => {
    await run({}, OWNER, "people", "link", "max:33", "telegram:11")
    const { merges } = await run({}, OWNER, "people", "show", "max:33")

    for (const args of [
      ["people", "unlink", "telegram:11"],
      ["people", "unlink", "max:33", "telegram:11"],
      ["people", "unmerge", merges[0].id],
    ])
      await expect(run(CLAUDE, NOBODY, ...args)).rejects.toMatchObject({ details: { reason: "identity.owner-only" } })
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(2)
  })

  it("are the app's to make with --from-app, and a scan does not join an undone merge again", async () => {
    await run({}, OWNER, "people", "link", "max:33", "telegram:11")
    const { merges } = await run({}, OWNER, "people", "show", "max:33")

    const restored = await run({}, NOBODY, "people", "unmerge", merges[0].id, "--from-app")
    await run({}, NOBODY, "people", "scan")

    expect(restored.identities).toMatchObject([{ identity: "max:33" }])
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(1)
  })
})

describe("memo people scan", () => {
  it("joins the two people a phone names, and memo sync --only people runs the same pass", async () => {
    const scan = await run({}, NOBODY, "people", "scan")

    expect(scan.merged).toMatchObject([{ signal: "same-phone" }])
    expect((await run({}, OWNER, "people", "show", "telegram:11")).identities).toHaveLength(2)
    const synced = await run({}, NOBODY, "sync", "--only", "people")
    expect(synced.people).toEqual({ merged: 0, proposed: 0, skipped: 0 })
  })

  it("points memo sync's text at people review", async () => {
    const store = await openStore({ env })
    await store.people.savePeople({ provider: "bitrix24", account: "acme" }, [
      { id: "c1", name: "Kai B", phone: "+7 900 555-00-00" },
    ])
    await store.people.savePeople({ provider: "amocrm", account: "acme" }, [
      { id: "c2", name: "Kai C", phone: "+79005550000" },
    ])
    await store.close()

    expect(await raw({}, NOBODY, "sync", "--only", "people")).toContain("memo people review")
  })
})

describe("over MCP", () => {
  it("offers no unlink or unmerge, and an agent's link is a proposal", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer(env, createProgram).connect(serverSide)
    const client = new Client({ name: "fixture", version: "0" })
    await client.connect(clientSide)
    try {
      const catalogue = await client.callTool({ name: "memo_tools_search", arguments: {} })
      const names = (catalogue.structuredContent as { items: { command: string }[] }).items.map(
        ({ command }) => command,
      )
      expect(names).toEqual(expect.arrayContaining(["people show", "people review", "people link"]))
      for (const owners of ["people unlink", "people unmerge"]) expect(names).not.toContain(owners)

      const call = await commandCaller(client)
      const linked = await call("people link", { identity: "max:33", other: "telegram:11", reason: "same face" })
      expect(answerOf(JSON.stringify(linked.structuredContent))).toMatchObject({ outcome: "proposed" })
    } finally {
      await client.close()
    }
  })
})
