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
    expect(shown.matches[0]).toMatchObject({
      joins: "person",
      signal: "agent",
      identity: "max:33",
      with: "telegram:11",
    })
    expect(page.items[0]).toMatchObject({ joins: "person", signal: "agent" })
  })
})

describe("a shared mailbox in people review", () => {
  it("lists first by score with its mailbox, and people resolve company gives the address to a company", async () => {
    const store = await openStore({ env })
    await store.people.savePeople(TG, [{ id: "44", name: "Ana Diaz", email: "info@shop.example" }])
    await store.people.savePeople(MAX, [{ id: "55", name: "Bo Lind", email: "info@shop.example" }])
    await store.close()
    await run({}, NOBODY, "people", "scan")
    await run(CLAUDE, NOBODY, "people", "link", "max:33", "telegram:11", "--reason", "same face")

    const listed = envelopeOf(await raw({}, OWNER, "people", "review", "--json")).items
    await expect(run(CLAUDE, NOBODY, "people", "resolve", listed[0].id, "company")).rejects.toMatchObject({
      code: "permission_error",
    })
    const decided = await run({}, OWNER, "people", "resolve", listed[0].id, "company")

    expect(listed).toMatchObject([
      { shared: "role", mailbox: "info@shop.example", score: 0.1 },
      { signal: "agent", score: null, shared: null, mailbox: null },
    ])
    expect(decided).toMatchObject({ status: "rejected", mailbox: "info@shop.example", closed: [listed[0].id] })
    expect(decided.organization).toMatch(/^organization:\d+$/)
    expect(envelopeOf(await raw({}, OWNER, "people", "review", "--json")).items).toMatchObject([{ signal: "agent" }])
  })
})

describe("people resolve company --all", () => {
  it("closes every match on the mailbox in one answer, and review shows them together by mailbox", async () => {
    const store = await openStore({ env })
    await store.people.savePeople(TG, [{ id: "44", name: "Ana Diaz", email: "info@shop.example" }])
    await store.people.savePeople(MAX, [
      { id: "55", name: "Bo Lind", email: "info@shop.example" },
      { id: "66", name: "Cy Moss", email: "info@shop.example" },
    ])
    await store.close()
    await run({}, NOBODY, "people", "scan")
    const listed = envelopeOf(await raw({}, OWNER, "people", "review", "--json")).items

    const decided = await run({}, OWNER, "people", "resolve", listed[0].id, "company", "--all")

    expect(listed).toHaveLength(3)
    for (const row of listed) expect(row).toMatchObject({ mailbox: "info@shop.example", shared: "role" })
    expect(listed[0].candidates).toHaveLength(3)
    expect([...decided.closed].sort()).toEqual(listed.map(({ id }: { id: string }) => id).sort())
    expect(envelopeOf(await raw({}, OWNER, "people", "review", "--json")).items).toEqual([])
  })
})

describe("the owner's separations", () => {
  it("take exact identity ids only, never the nearest name", async () => {
    await run({}, OWNER, "people", "link", "max:33", "telegram:11")
    const { ref } = await run({}, OWNER, "people", "show", "max:33")

    await expect(
      run({}, NOBODY, "people", "unlink", "telegram:Rin Example", "--from", ref, "--from-app"),
    ).rejects.toMatchObject({ code: "not_found", details: { reason: "identity.not-found" } })
    await expect(run({}, OWNER, "people", "unlink", "max:Kai", "--from", ref)).rejects.toMatchObject({
      details: { reason: "identity.not-found" },
    })
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(2)
    expect(
      (await run({}, NOBODY, "people", "unlink", "telegram:11", "--from", ref, "--from-app")).identities,
    ).toHaveLength(1)
  })

  it("name the person the identities leave, and are refused when they sit on someone else (BUG-709)", async () => {
    const store = await openStore({ env })
    await store.people.savePeople(TG, [{ id: "101", name: "Me" }])
    await store.people.linkToOwner({ provider: "telegram", id: "101" })
    await store.close()
    await run({}, OWNER, "people", "link", "max:33", "telegram:11")
    const { ref } = await run({}, OWNER, "people", "show", "max:33")

    await expect(run({}, OWNER, "people", "unlink", "telegram:11")).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "person.from-required", param: "from" },
    })
    await expect(run({}, OWNER, "people", "unlink", "telegram:11", "--from", "max:33")).rejects.toMatchObject({
      details: { reason: "person.from-required" },
    })
    await expect(run({}, OWNER, "people", "unlink", "telegram:11", "--from", "person:me")).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "identity.held-elsewhere", reference: ref },
    })
    await expect(
      run(CLAUDE, NOBODY, "people", "unlink", "telegram:11", "--from", "person:me", "--reason", "not his"),
    ).rejects.toMatchObject({ details: { reason: "identity.held-elsewhere" } })
    await expect(
      run({}, OWNER, "people", "unlink", "telegram:11", "max:33", "--from", "person:me"),
    ).rejects.toMatchObject({ details: { reason: "identity.held-elsewhere", reference: ref } })
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(2)
  })

  it("from an agent wait for the owner with a reason, and only the owner's confirm applies them", async () => {
    await run({}, OWNER, "people", "link", "max:33", "telegram:11")
    const { merges } = await run({}, OWNER, "people", "show", "max:33")
    const { ref } = await run({}, OWNER, "people", "show", "max:33")
    await expect(run(CLAUDE, NOBODY, "people", "unlink", "telegram:11", "--from", ref)).rejects.toMatchObject({
      details: { reason: "proposal.reason-required" },
    })

    const unlink = await run(
      CLAUDE,
      NOBODY,
      "people",
      "unlink",
      "telegram:11",
      "--from",
      ref,
      "--reason",
      "another man",
    )
    const unmerge = await run(CLAUDE, NOBODY, "people", "unmerge", merges[0].id, "--reason", "a shared phone")
    expect([unlink.outcome, unmerge.outcome]).toEqual(["proposed", "proposed"])
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(2)

    const waiting = envelopeOf(await raw({}, OWNER, "people", "review", "--kind", "split", "--json"))
    expect(waiting.items).toMatchObject([
      { id: unmerge.proposal, kind: "identity_split", split: "unmerge", reason: "a shared phone" },
      { id: unlink.proposal, kind: "identity_split", split: "unlink", identities: ["telegram:11"] },
    ])
    expect(waiting.items[0]).not.toHaveProperty("persons")
    await expect(run(CLAUDE, NOBODY, "people", "confirm", unlink.proposal)).rejects.toMatchObject({
      details: { reason: "identity.owner-only" },
    })

    const accepted = await run({}, OWNER, "people", "confirm", unlink.proposal)
    expect(accepted.decided).toMatchObject([{ kind: "identity_split", status: "confirmed" }])
    expect((await run({}, OWNER, "people", "show", "max:33")).identities).toHaveLength(1)
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

describe("memo people confirm and reject", () => {
  it("all shows what it would do until --yes, then answers every listed proposal", async () => {
    await run(CLAUDE, NOBODY, "people", "link", "max:33", "telegram:11", "--reason", "same face")
    await run(CLAUDE, NOBODY, "people", "link", "max:33", "max:22", "--reason", "same voice")

    const preview = await run({}, OWNER, "people", "reject", "all", "--reason", "not one")
    expect(preview).toMatchObject({ outcome: "preview", would: "reject" })
    expect(preview.ids).toHaveLength(2)
    expect(envelopeOf(await raw({}, OWNER, "people", "review", "--json")).items).toHaveLength(2)

    const done = await run({}, OWNER, "people", "reject", "all", "--yes", "--reason", "not one")
    expect(done.decided.map(({ status }: { status: string }) => status)).toEqual(["rejected", "rejected"])
    expect(envelopeOf(await raw({}, OWNER, "people", "review", "--json")).items).toEqual([])
  })

  it("refuses a proposal that is not about people and still decides the rest, as the desktop app asks", async () => {
    const { proposal } = await run(CLAUDE, NOBODY, "people", "link", "max:33", "telegram:11", "--reason", "same face")
    const store = await openStore({ env })
    const other = await store.proposedActions.propose({ kind: "reply", by: { bot: "claude-code" } })
    await store.close()

    const done = await run({}, NOBODY, "people", "reject", proposal, other.id, "--reason", "not one", "--from-app")

    expect(done).toMatchObject({
      decided: [{ id: proposal, status: "rejected" }],
      refused: [{ id: other.id, reason: "proposal.not-people" }],
    })
  })
})

describe("memo people links check", () => {
  it("names a person with two names and nothing in common, and people show person:me is the owner", async () => {
    const store = await openStore({ env })
    await store.accounts.saveAccount(TG, { name: null })
    await store.people.savePeople(TG, [{ id: "1", name: "Lena Example" }])
    await store.accounts.saveAccount(TG, { name: null })
    await store.people.linkIdentities(
      { provider: "max", id: "33" },
      { provider: "telegram", id: "11" },
      { method: "same-email", by: "rules" },
    )
    await store.close()

    const doubts = envelopeOf(await raw({}, OWNER, "people", "links", "check", "--json"))
    expect(doubts.items).toMatchObject([{ reason: "mixed-names" }])
    expect(doubts.page.total).toMatchObject({ value: 1 })
    expect(await raw({}, OWNER, "people", "links", "check")).toContain("mixed-names")
    expect((await run({}, OWNER, "people", "show", "person:me")).identities).toMatchObject([{ identity: "telegram:1" }])
  })

  it("people links resolve keep is the owner's: the doubt goes, and an agent is refused", async () => {
    const store = await openStore({ env })
    await store.people.linkIdentities(
      { provider: "max", id: "33" },
      { provider: "telegram", id: "11" },
      { method: "same-email", by: "rules" },
    )
    await store.close()
    const [doubt] = envelopeOf(await raw({}, OWNER, "people", "links", "check", "--json")).items
    const person = doubt.person as string

    await expect(run(CLAUDE, NOBODY, "people", "links", "resolve", person, "keep")).rejects.toMatchObject({
      details: { reason: "identity.owner-only" },
    })
    const kept = await run(CLAUDE, NOBODY, "people", "links", "resolve", person, "keep", "--from-app")

    expect(kept).toMatchObject({ person, kept: [expect.any(String)] })
    expect(envelopeOf(await raw({}, OWNER, "people", "links", "check", "--json")).items).toEqual([])
    await expect(run({}, OWNER, "people", "links", "resolve", "max:33", "keep")).rejects.toMatchObject({
      details: { reason: "person.no-doubt" },
    })
    await expect(
      run(CLAUDE, NOBODY, "people", "unlink", kept.kept[0], "--from", person, "--reason", "two names"),
    ).rejects.toMatchObject({
      details: { reason: "identity.kept-together" },
    })
  })

  it("people show gives the name people list shows, an account's when the person has none", async () => {
    const store = await openStore({ env })
    await store.people.savePeople(TG, [{ id: "44", name: "!", username: "xorlov" }])
    await store.people.savePeople(MAX, [{ id: "45", name: "Ярослав Орлов" }])
    await store.people.linkIdentities(
      { provider: "telegram", id: "44" },
      { provider: "max", id: "45" },
      { method: "manual", by: "owner" },
    )
    await store.close()

    const shown = await run({}, OWNER, "people", "show", "telegram:44")
    const listed = envelopeOf(await raw({}, OWNER, "people", "list", "kind:all", "--json")).items.find(
      ({ ref }: { ref: string }) => ref === shown.ref,
    )

    expect(shown.display_name).toBe("Ярослав Орлов")
    expect(listed.display_name).toBe(shown.display_name)
  })

  it("prints how and when each merge was made", async () => {
    await run({}, OWNER, "people", "link", "max:33", "telegram:11")

    expect(await raw({}, OWNER, "people", "show", "max:33")).toMatch(
      /merged: merge:\d+-\d+ \(person:\d+\) by owner via manual, \d{4}-\d\d-\d\d/,
    )
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
  it("offers no confirm or reject, and an agent's link and unlink are proposals", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer(env, createProgram).connect(serverSide)
    const client = new Client({ name: "fixture", version: "0" })
    await client.connect(clientSide)
    try {
      const catalogue = await client.callTool({ name: "memo_tools_search", arguments: {} })
      const names = (catalogue.structuredContent as { items: { command: string }[] }).items.map(
        ({ command }) => command,
      )
      expect(names).toEqual(
        expect.arrayContaining(["people show", "people review", "people link", "people unlink", "people links check"]),
      )
      for (const owners of ["people confirm", "people reject"]) expect(names).not.toContain(owners)

      const call = await commandCaller(client)
      const linked = await call("people link", { identity: "max:33", other: "telegram:11", reason: "same face" })
      expect(answerOf(JSON.stringify(linked.structuredContent))).toMatchObject({ outcome: "proposed" })
      const unlinked = await call("people unlink", {
        identities: ["max:22"],
        from: "person:me",
        reason: "another man",
        as_owner: true,
      })
      expect(unlinked.isError).toBe(true)
    } finally {
      await client.close()
    }
  })
})
