import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { syncCrm } from "@wirecat/cli-core/crm"
import { ACME_PORTAL, type AcmeScenario, acmeScenario, fakeCrmSource } from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf } from "../test/answer.js"
import { commandCaller } from "../test/mcp.js"
import { memoIn } from "../test/memo.js"
import { updateConfig } from "./config.js"
import { createMemoServer } from "./mcp/server.js"
import { createProgram } from "./program.js"

let env: NodeJS.ProcessEnv
let refs: AcmeScenario["refs"]
let memo: ReturnType<typeof memoIn>

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-crm-"))
  env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const store = await openStore({ env })
  try {
    // A real CRM CLI registers its provider on every run; the scenario's fake portal does not.
    await store.accounts.registerProvider({ name: ACME_PORTAL.provider, kind: "crm", aliases: [] })
    refs = (await acmeScenario(store)).refs
  } finally {
    await store.close()
  }
  memo = memoIn(env)
})

const kinds = (answer: { items: { kind: string }[] }) => answer.items.map((item) => item.kind)

describe("search all and the CRM", () => {
  it("leaves deals out of search all when the owner denies deals (SEC-151)", async () => {
    expect(kinds(await memo("search", "all", "renewal", "--exact"))).toContain("deal")
    updateConfig((config) => ({ ...config, permissions: { deals: "deny" } }), env)
    const answer = await memo("search", "all", "renewal", "--exact")
    expect(kinds(answer)).not.toContain("deal")
  })
})

const PORTAL = `${ACME_PORTAL.provider}:${ACME_PORTAL.account}`

describe("a person's context (plan §8 rows 1 and 5)", () => {
  it("reads one person across their CRM contact and Telegram identity, with no --source", async () => {
    const alice = await memo("context", refs.alice)
    expect(alice.messages.person.identities.map(({ provider }: { provider: string }) => provider).sort()).toEqual([
      "email",
      ACME_PORTAL.provider,
      "telegram",
    ])
    expect(alice.messages.recent.direct.map(({ text }: { text: string }) => text)).toContain(
      "Can we renew Atlas before December?",
    )
    expect(alice.business.organizations.items).toEqual([
      expect.objectContaining({
        ref: refs.acme,
        roles: [expect.objectContaining({ kind: "member-of", role: "contact", standing: "reported", account: PORTAL })],
      }),
    ])
    expect(alice.coverage.accounts).toEqual(expect.arrayContaining([PORTAL]))
    expect(alice.not_read.map(({ source }: { source: string }) => source)).not.toContain("events")
  })

  it("answers for a CRM-only person and for a name-only person", async () => {
    const emma = await memo("context", refs.emma)
    expect(emma.messages.person).toMatchObject({ name: "Emma" })
    expect(emma.business.deals.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.deal])
    const dana = await memo("people", "add", "Dana Example")
    const named = await memo("context", dana.ref ?? `person:${dana.uid}`)
    expect(named.messages.person).toMatchObject({ name: "Dana Example" })
    expect(named.business.organizations.items).toEqual([])
  })
})

describe("organization, deal and relationships", () => {
  it("gives an organization's people, deals and money, and lists it by category", async () => {
    const acme = await memo("organizations", "context", refs.acme)
    expect(acme.people.items.map(({ ref }: { ref: string }) => ref).sort()).toEqual([refs.alice, refs.bob].sort())
    expect(acme.deals.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.deal])
    expect(acme.money.invoices.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.invoice])
    expect(acme.money.payments.items).toEqual([])
    const clients = await memo("organizations", "list", "category:client")
    expect(clients.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.acme])
  })

  it("gives a deal's context and brief, and sets its project", async () => {
    const deal = await memo("deals", "context", refs.deal)
    expect(deal.participants.items.map(({ ref }: { ref: string }) => ref)).toEqual(
      expect.arrayContaining([refs.alice, refs.bob]),
    )
    expect(deal.communications.items.every(({ standing }: { standing: string }) => standing === "proposed")).toBe(true)
    const brief = await memo("deals", "context", refs.deal, "--brief")
    expect(brief).toMatchObject({ ref: refs.deal, title: "Acme renewal" })
    await expect(memo("leads", "context", refs.deal)).rejects.toMatchObject({ code: "validation_error" })
    const cleared = await memo("deals", "update", refs.deal, "--project", "")
    expect(cleared.project).toBeNull()
  })

  it("filters relationships and reads them both ways with their standing", async () => {
    const reported = await memo("relationships", "list", "standing:reported", `to:"${refs.acme}"`)
    expect(reported.items.map(({ from }: { from: string }) => from).sort()).toEqual([refs.alice, refs.bob].sort())
    expect(reported.items.every(({ account }: { account: string }) => account === PORTAL)).toBe(true)
    await memo("relationships", "add", refs.alice, refs.bob, "--kind", "reports-to")
    const bob = await memo("relationships", "list", `about:"${refs.bob}"`, "kind:reports-to")
    expect(bob.items).toEqual([
      expect.objectContaining({ from: refs.alice, direction: "to", label: "manages", standing: "confirmed" }),
    ])
    await expect(
      memo("relationships", "add", refs.alice, refs.acme, "--role", "procurement-manager"),
    ).rejects.toMatchObject({ code: "validation_error" })
  })
})

/** Every `next` a context gives: the memo command that lists the rest of a section it cut. */
const nextsOf = (value: unknown): string[] =>
  value === null || typeof value !== "object"
    ? []
    : Object.entries(value).flatMap(([key, inner]) =>
        key === "next" && typeof inner === "string" ? [inner] : nextsOf(inner),
      )

const wordsOf = (command: string) =>
  [...command.matchAll(/(?:[^\s"]+|"[^"]*")+/g)].map(([word]) => word.replaceAll('"', ""))

it("runs every next command the contexts give, as written", async () => {
  const answers = [
    await memo("context", refs.alice, "--limit", "1"),
    await memo("organizations", "context", refs.acme, "--limit", "1"),
    await memo("deals", "context", refs.deal, "--limit", "1"),
  ]
  const nexts = [...new Set(answers.flatMap(nextsOf))].filter((next) => next !== "review list")
  expect(nexts.length).toBeGreaterThan(0)
  for (const next of nexts) {
    const answer = await memo(...wordsOf(next))
    expect(answer.items.length, next).toBeGreaterThan(0)
  }
})

describe("groups and the CRM (plan §8 row 11)", () => {
  it("runs the command a first CRM sync's group hint names, as written", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-crm-hint-"))
    const fresh = { ...env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
    const store = await openStore({ env: fresh })
    let hint: string | undefined
    try {
      const crm = fakeCrmSource()
      crm.put("organization", { externalId: "c1", name: "Acme Ltd" })
      hint = (await syncCrm(crm, store, ACME_PORTAL)).groupHint
    } finally {
      await store.close()
    }
    expect(hint).toBe(`add it to a work group: \`memo groups add work ${PORTAL}\``)
    const words = /`memo (.+)`/.exec(hint as string)?.[1]?.split(" ") ?? []
    const row = (await memoIn(fresh)(...words)).groups.work
    expect(row).toEqual([expect.objectContaining(ACME_PORTAL)])
  })

  it("keeps a work CRM's deals, people and relationships out of a personal run", async () => {
    await memo("groups", "add", "work", PORTAL)
    const alice = await memo("personal", "context", refs.alice)
    expect(alice.business.organizations.items).toEqual([])
    expect(alice.relationships.filter(({ standing }: { standing: string }) => standing === "reported")).toEqual([])
    expect((await memo("personal", "relationships", "list", "standing:reported")).items).toEqual([])
    expect((await memo("personal", "organizations", "context", refs.acme)).people.items).toEqual([])
    const personal = await memo("personal", "search", "all", "renewal", "--exact")
    expect(kinds(personal)).not.toContain("deal")
    await expect(memo("personal", "deals", "context", refs.deal)).rejects.toMatchObject({ code: "not_found" })
    expect(kinds(await memo("work", "search", "all", "renewal", "--exact", "--only", "crm"))).toEqual(["deal"])
  })
})

it("leaves deals out of search all over MCP when the server denies them (SEC-151)", async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram, ["deals=deny"]).connect(serverSide)
  const client = new Client({ name: "deny", version: "0" })
  await client.connect(clientSide)
  try {
    const call = await commandCaller(client)
    const found = answerOf(
      JSON.stringify((await call("search all", { query: "renewal", exact: true })).structuredContent),
    )
    expect(kinds(found)).not.toContain("deal")
    expect(kinds(found)).toContain("mail")
  } finally {
    await client.close()
  }
})

it("finds every new command with memo_tools_search (plan §8 row 12)", async () => {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(serverSide)
  const client = new Client({ name: "crm", version: "0" })
  await client.connect(clientSide)
  try {
    for (const command of [
      "groups list",
      "groups add",
      "groups remove",
      "groups move",
      "organizations context",
      "deals context",
      "leads context",
      "deals update",
      "leads update",
      "relationships list",
    ]) {
      const found = await client.callTool({ name: "memo_tools_search", arguments: { query: command } })
      const { items } = found.structuredContent as { items: { command: string }[] }
      expect(
        items.map((item) => item.command),
        command,
      ).toContain(command)
    }
  } finally {
    await client.close()
  }
})
