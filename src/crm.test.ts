import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { syncCrm } from "@wirecat/cli-core/crm"
import {
  ACME_CALENDAR,
  ACME_MAIL,
  ACME_PORTAL,
  ACME_TELEGRAM,
  type AcmeScenario,
  acmeScenario,
  fakeCrmSource,
} from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
    // A group is only what the owner saves: the scenario's own accounts as `personal`.
    await store.accounts.saveAccountGroup(
      "personal",
      [ACME_TELEGRAM, ACME_MAIL, ACME_CALENDAR].map(({ provider, account }) => `${provider}:${account}`),
    )
  } finally {
    await store.close()
  }
  memo = memoIn(env)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const kinds = (answer: { items: { kind: string }[] }) => answer.items.map((item) => item.kind)

describe("search all and the CRM", () => {
  // Permissions guard an MCP client only (#739); the MCP case is below.
  it("finds deals in search all at the owner's terminal, whatever the permissions say", async () => {
    expect(kinds(await memo("search", "all", "renewal", "--exact"))).toContain("deal")
    updateConfig((config) => ({ ...config, permissions: { deals: "deny" } }), env)
    expect(kinds(await memo("search", "all", "renewal", "--exact"))).toContain("deal")
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
    expect((await memo("search", "people", "dana")).items).toEqual([
      expect.objectContaining({ ref: dana.ref ?? `person:${dana.uid}`, name: "Dana Example", identities: [] }),
    ])
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
      expect.objectContaining({ from: refs.alice, direction: "incoming", inverse: "manages", standing: "confirmed" }),
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
    const row = (await memoIn(fresh)(...words)).items.find(({ group }: { group: string }) => group === "work")?.members
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

describe("deals denied (SEC-151)", () => {
  it("leaves deals out of the person and organization contexts and of relationships", async () => {
    updateConfig((config) => ({ ...config, permissions: { deals: "deny" } }), env)
    expect((await memo("context", refs.alice)).business.deals.items).toEqual([])
    const acme = await memo("organizations", "context", refs.acme)
    expect(acme.deals.items).toEqual([])
    expect(JSON.stringify(acme)).not.toContain(`"${refs.deal}"`)
    expect(
      (await memo("relationships", "list", `about:"${refs.alice}"`)).items.map(({ from }: { from: string }) => from),
    ).not.toContain(refs.deal)
    await expect(memo("deals", "context", refs.deal)).rejects.toMatchObject({
      code: "permission_error",
      details: { reason: "deal.denied" },
    })
  })
})

describe("a work CRM under MEMO_GROUP_LOCK=personal", () => {
  it("refuses its deal's context and a change to its project", async () => {
    await memo("groups", "add", "work", PORTAL)
    vi.stubEnv("MEMO_GROUP_LOCK", "personal")
    const locked = memoIn({ ...env, MEMO_GROUP_LOCK: "personal" })
    await expect(locked("deals", "context", refs.deal)).rejects.toMatchObject({ code: "permission_error" })
    await expect(locked("deals", "update", refs.deal, "--project", "")).rejects.toMatchObject({
      code: "permission_error",
    })
  })
})

describe("relationships: the owner's dates, position and end", () => {
  it("pages, filters by role, day and ending, and refuses a bad category", async () => {
    const rows = await memo("relationships", "list", "--limit", "1")
    expect(rows.items).toHaveLength(1)
    const second = await memo("relationships", "list", "--limit", "1", "--page", "2")
    expect(second.items).toHaveLength(1)
    expect(second.items[0].id).not.toBe(rows.items[0].id)
    expect(
      (await memo("relationships", "list", "role:decision-maker")).items.map(({ to }: { to: string }) => to),
    ).toEqual([refs.bob])
    const added = await memo(
      "relationships",
      "add",
      refs.bob,
      refs.acme,
      "--role",
      "employee",
      "--position",
      "CEO",
      "--start-date",
      "2026-01-01",
    )
    expect(added).toMatchObject({ position: "CEO", starts_at: "2026-01-01T00:00:00.000Z" })
    expect((await memo("relationships", "list", "at:2025-06-01", "role:employee", `from:"${refs.bob}"`)).items).toEqual(
      [],
    )
    expect(
      (await memo("relationships", "list", "at:2026-06-01", "role:employee", `from:"${refs.bob}"`)).items,
    ).toHaveLength(1)
    await memo("relationships", "end", added.id, "--end-date", "2026-09-30")
    expect((await memo("relationships", "list", "role:employee", `from:"${refs.bob}"`)).items).toEqual([])
    expect((await memo("relationships", "list", "role:employee", `from:"${refs.bob}"`, "include:ended")).items).toEqual(
      [expect.objectContaining({ id: added.id, standing: "ended" })],
    )
    await expect(memo("organizations", "list", "category:friend")).rejects.toMatchObject({ code: "validation_error" })
  })

  it("keeps the owner's project on a CRM deal across the next sync", async () => {
    const root = mkdtempSync(join(tmpdir(), "memo-crm-sync-"))
    const fresh = { ...env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
    const store = await openStore({ env: fresh })
    try {
      await store.accounts.registerProvider({ name: ACME_PORTAL.provider, kind: "crm", aliases: [] })
      const scenario = await acmeScenario(store)
      const run = memoIn(fresh)
      const beacon = await run("projects", "add", "Beacon", "--key", "BCN")
      await run("deals", "update", scenario.refs.deal, "--project", "BCN")
      await scenario.sync()
      expect((await run("deals", "show", scenario.refs.deal)).project).toBe(beacon.ref)
    } finally {
      await store.close()
    }
  })
})

describe("a personal run of a work CRM (NEW-1 to NEW-4)", () => {
  it("refuses the work deal by its bare id", async () => {
    await memo("groups", "add", "work", PORTAL)
    vi.stubEnv("MEMO_GROUP_LOCK", "personal")
    const locked = memoIn({ ...env, MEMO_GROUP_LOCK: "personal" })
    await expect(locked("deals", "update", refs.deal.split(":")[1] as string, "--project", "")).rejects.toMatchObject({
      code: "permission_error",
    })
  })

  it("shows no relationship of the work deal, the owner's own included", async () => {
    await memo("groups", "add", "work", PORTAL)
    const bob = await memo("personal", "context", refs.bob)
    expect(JSON.stringify(bob.relationships)).not.toContain(refs.deal)
    expect(JSON.stringify(bob.business)).not.toContain(refs.deal)
  })

  it("shows the owner's own notes about a person and an organization in a work run", async () => {
    await memo("groups", "add", "work", PORTAL)
    await memo("notes", "add", "Alice prefers mornings", "--subject", refs.alice)
    await memo("notes", "add", "Acme pays late", "--subject", refs.acme)
    vi.stubEnv("MEMO_GROUP_LOCK", "work")
    const work = memoIn({ ...env, MEMO_GROUP_LOCK: "work" })
    expect((await work("context", refs.alice)).your_notes).toHaveLength(1)
    expect((await work("organizations", "context", refs.acme)).notes.about).toHaveLength(1)
  })

  it("names no denied deal in a person's relationships", async () => {
    updateConfig((config) => ({ ...config, permissions: { deals: "deny" } }), env)
    const bob = await memo("context", refs.bob)
    expect(JSON.stringify(bob.relationships)).not.toContain(refs.deal)
  })
})

describe("relationship roles: built in and the owner's own", () => {
  it("lists, adds and removes an owner role, and refuses a built-in or one in use", async () => {
    const listed = await memo("relationships", "roles", "list", "list:organization")
    expect(listed.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "employee", built_in: true })]))
    const added = await memo("relationships", "roles", "add", "organization", "board-member", "--label", "Board member")
    expect(added.items).toEqual(
      expect.arrayContaining([
        { list: "organization", id: "board-member", label: "Board member", labels: null, built_in: false },
      ]),
    )
    const link = await memo("relationships", "add", refs.bob, refs.acme, "--role", "board-member")
    expect(link).toMatchObject({ role: "board-member" })
    expect((await memo("relationships", "list", `from:"${refs.bob}"`, "role:board-member")).items[0].custom).toBe(false)
    await expect(memo("relationships", "roles", "remove", "organization", "board-member")).rejects.toMatchObject({
      details: { reason: "relationship.role-in-use" },
    })
    await expect(memo("relationships", "roles", "remove", "organization", "employee")).rejects.toMatchObject({
      code: "validation_error",
    })
    await memo("relationships", "remove", link.id)
    await memo("relationships", "roles", "remove", "organization", "board-member")
    expect(
      (await memo("relationships", "roles", "list", "list:organization")).items.map(({ id }: { id: string }) => id),
    ).not.toContain("board-member")
  })

  it("lists the related roles with their labels in three languages", async () => {
    const related = await memo("relationships", "roles", "list", "list:related")
    expect(related.items).toEqual(
      expect.arrayContaining([
        {
          list: "related",
          id: "colleague",
          label: null,
          labels: { en: "Colleague", ru: "Коллега", es: "Colega" },
          built_in: true,
        },
      ]),
    )
  })

  it("lets an agent read the role lists and change none", async () => {
    const agent = memoIn({ ...env, AI_AGENT: "test-agent" })
    expect((await agent("relationships", "roles", "list")).items.length).toBeGreaterThan(0)
    await expect(agent("relationships", "roles", "add", "project", "sponsor")).rejects.toMatchObject({
      code: "permission_error",
    })
  })

  it("lists the roles under the lock", async () => {
    vi.stubEnv("MEMO_GROUP_LOCK", "personal")
    expect(
      (await memoIn({ ...env, MEMO_GROUP_LOCK: "personal" })("relationships", "roles", "list", "list:deal")).items,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: "decision-maker" })]))
  })
})
