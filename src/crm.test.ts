import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
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
import { addNote } from "../test/notes.js"
import { updateConfig } from "./config.js"
import { createMemoServer } from "./mcp/server.js"
import { createProgram } from "./program.js"

let env: NodeJS.ProcessEnv
let refs: AcmeScenario["refs"]
let wcat: ReturnType<typeof memoIn>

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "wcat-crm-"))
  env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), WCAT_CONFIG_DIR: join(root, "config") }
  delete env.WCAT_GROUP
  delete env.WCAT_GROUP_LOCK
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
  wcat = memoIn(env)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const kinds = (answer: { items: { kind: string }[] }) => answer.items.map((item) => item.kind)

describe("search all and the CRM", () => {
  // Permissions guard an MCP client only (#739); the MCP case is below.
  it("finds deals in search all at the owner's terminal, whatever the permissions say", async () => {
    expect(kinds(await wcat("search", "all", "renewal", "--exact"))).toContain("deal")
    updateConfig((config) => ({ ...config, permissions: { deals: "deny" } }), env)
    expect(kinds(await wcat("search", "all", "renewal", "--exact"))).toContain("deal")
  })
})

const PORTAL = `${ACME_PORTAL.provider}:${ACME_PORTAL.account}`

describe("a person's context (plan §8 rows 1 and 5)", () => {
  it("reads one person across their CRM contact and Telegram identity, with no --source", async () => {
    const alice = await wcat("context", refs.alice)
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
    const emma = await wcat("context", refs.emma)
    expect(emma.messages.person).toMatchObject({ name: "Emma" })
    expect(emma.business.deals.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.deal])
    const dana = await wcat("people", "add", "Dana Example")
    expect((await wcat("search", "people", "dana")).items).toEqual([
      expect.objectContaining({ ref: dana.ref ?? `person:${dana.uid}`, name: "Dana Example", identities: [] }),
    ])
    const named = await wcat("context", dana.ref ?? `person:${dana.uid}`)
    expect(named.messages.person).toMatchObject({ name: "Dana Example" })
    expect(named.business.organizations.items).toEqual([])
  })
})

describe("organization, deal and relationships", () => {
  it("gives an organization's people, deals and money, and lists it by category", async () => {
    const acme = await wcat("organizations", "context", refs.acme)
    expect(acme.people.items.map(({ ref }: { ref: string }) => ref).sort()).toEqual([refs.alice, refs.bob].sort())
    expect(acme.deals.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.deal])
    expect(acme.money.invoices.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.invoice])
    expect(acme.money.payments.items).toEqual([])
    const said = acme.communications.messages + acme.communications.mail + acme.communications.meetings
    expect(acme.history.items.length).toBe(Math.min(said, 20))
    expect(acme.history.items.length).toBeGreaterThan(0)
    expect(acme.untrusted).toEqual(["history.items.title", "history.items.text"])
    vi.stubEnv("TZ", "UTC")
    const streams = captureStreams()
    await createProgram({ streams, env }).parseAsync(["organizations", "context", refs.acme], { from: "user" })
    vi.unstubAllEnvs()
    expect(streams.stdout.join("")).toMatch(
      /\nHistory, times in UTC\n {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}(message|mail|meeting) /,
    )
    const clients = await wcat("organizations", "list", "category:client")
    expect(clients.items.map(({ ref }: { ref: string }) => ref)).toEqual([refs.acme])
  })

  it("gives a deal's context and brief, and sets its project", async () => {
    const deal = await wcat("deals", "context", refs.deal)
    expect(deal.participants.items.map(({ ref }: { ref: string }) => ref)).toEqual(
      expect.arrayContaining([refs.alice, refs.bob]),
    )
    expect(deal.communications.items.every(({ standing }: { standing: string }) => standing === "proposed")).toBe(true)
    const brief = await wcat("deals", "context", refs.deal, "--brief")
    expect(brief).toMatchObject({ ref: refs.deal, title: "Acme renewal" })
    await expect(wcat("leads", "context", refs.deal)).rejects.toMatchObject({ code: "validation_error" })
    const cleared = await wcat("deals", "update", refs.deal, "--project", "")
    expect(cleared.project).toBeNull()
  })

  it("filters relationships and reads them both ways with their standing", async () => {
    const reported = await wcat("relationships", "list", "standing:reported", `to:"${refs.acme}"`)
    expect(reported.items.map(({ from }: { from: string }) => from).sort()).toEqual([refs.alice, refs.bob].sort())
    expect(reported.items.every(({ account }: { account: string }) => account === PORTAL)).toBe(true)
    await wcat("relationships", "add", refs.alice, refs.bob, "--kind", "reports-to")
    const bob = await wcat("relationships", "list", `about:"${refs.bob}"`, "kind:reports-to")
    expect(bob.items).toEqual([
      expect.objectContaining({ from: refs.alice, direction: "incoming", inverse: "manages", standing: "confirmed" }),
    ])
    await expect(
      wcat("relationships", "add", refs.alice, refs.acme, "--role", "procurement-manager"),
    ).rejects.toMatchObject({ code: "validation_error" })
  })
})

/** Every `next` a context gives: the wcat command that lists the rest of a section it cut. */
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
    await wcat("context", refs.alice, "--limit", "1"),
    await wcat("organizations", "context", refs.acme, "--limit", "1"),
    await wcat("deals", "context", refs.deal, "--limit", "1"),
  ]
  const nexts = [...new Set(answers.flatMap(nextsOf))].filter((next) => next !== "review list")
  expect(nexts.length).toBeGreaterThan(0)
  for (const next of nexts) {
    const answer = await wcat(...wordsOf(next))
    expect(answer.items.length, next).toBeGreaterThan(0)
  }
})

describe("groups and the CRM (plan §8 row 11)", () => {
  it("runs the command a first CRM sync's group hint names, as written", async () => {
    const root = mkdtempSync(join(tmpdir(), "wcat-crm-hint-"))
    const fresh = { ...env, MESSAGING_STORE: join(root, "m.db"), WCAT_CONFIG_DIR: join(root, "config") }
    const store = await openStore({ env: fresh })
    let hint: string | undefined
    try {
      const crm = fakeCrmSource()
      crm.put("organization", { externalId: "c1", name: "Acme Ltd" })
      hint = (await syncCrm(crm, store, ACME_PORTAL)).groupHint
    } finally {
      await store.close()
    }
    // cli-core 2.0.0 writes the hint with memo's name; the cli-core release of the split writes wcat's.
    expect(hint).toMatch(new RegExp(`^add it to a work group: \`(memo|wcat) groups add work ${PORTAL}\`$`))
    const words = /`(?:memo|wcat) (.+)`/.exec(hint as string)?.[1]?.split(" ") ?? []
    const row = (await memoIn(fresh)(...words)).items.find(({ group }: { group: string }) => group === "work")?.members
    expect(row).toEqual([expect.objectContaining(ACME_PORTAL)])
  })

  it("keeps a work CRM's deals, people and relationships out of a personal run", async () => {
    await wcat("groups", "add", "work", PORTAL)
    const alice = await wcat("personal", "context", refs.alice)
    expect(alice.business.organizations.items).toEqual([])
    expect(alice.relationships.filter(({ standing }: { standing: string }) => standing === "reported")).toEqual([])
    expect((await wcat("personal", "relationships", "list", "standing:reported")).items).toEqual([])
    expect((await wcat("personal", "organizations", "context", refs.acme)).people.items).toEqual([])
    const personal = await wcat("personal", "search", "all", "renewal", "--exact")
    expect(kinds(personal)).not.toContain("deal")
    await expect(wcat("personal", "deals", "context", refs.deal)).rejects.toMatchObject({ code: "not_found" })
    expect(kinds(await wcat("work", "search", "all", "renewal", "--exact", "--only", "crm"))).toEqual(["deal"])
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

it("finds every new command with wcat_tools_search (plan §8 row 12)", async () => {
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
      const found = await client.callTool({ name: "wcat_tools_search", arguments: { query: command } })
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
    expect((await wcat("context", refs.alice)).business.deals.items).toEqual([])
    const acme = await wcat("organizations", "context", refs.acme)
    expect(acme.deals.items).toEqual([])
    expect(JSON.stringify(acme)).not.toContain(`"${refs.deal}"`)
    expect(
      (await wcat("relationships", "list", `about:"${refs.alice}"`)).items.map(({ from }: { from: string }) => from),
    ).not.toContain(refs.deal)
    await expect(wcat("deals", "context", refs.deal)).rejects.toMatchObject({
      code: "permission_error",
      details: { reason: "deal.denied" },
    })
  })
})

describe("a work CRM under WCAT_GROUP_LOCK=personal", () => {
  it("refuses its deal's context and a change to its project", async () => {
    await wcat("groups", "add", "work", PORTAL)
    vi.stubEnv("WCAT_GROUP_LOCK", "personal")
    const locked = memoIn({ ...env, WCAT_GROUP_LOCK: "personal" })
    await expect(locked("deals", "context", refs.deal)).rejects.toMatchObject({ code: "permission_error" })
    await expect(locked("deals", "update", refs.deal, "--project", "")).rejects.toMatchObject({
      code: "permission_error",
    })
  })
})

describe("relationships: the owner's dates, position and end", () => {
  it("pages, filters by role, day and ending, and refuses a bad category", async () => {
    const rows = await wcat("relationships", "list", "--limit", "1")
    expect(rows.items).toHaveLength(1)
    const second = await wcat("relationships", "list", "--limit", "1", "--page", "2")
    expect(second.items).toHaveLength(1)
    expect(second.items[0].id).not.toBe(rows.items[0].id)
    expect(
      (await wcat("relationships", "list", "role:decision-maker")).items.map(({ to }: { to: string }) => to),
    ).toEqual([refs.bob])
    const added = await wcat(
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
    expect((await wcat("relationships", "list", "at:2025-06-01", "role:employee", `from:"${refs.bob}"`)).items).toEqual(
      [],
    )
    expect(
      (await wcat("relationships", "list", "at:2026-06-01", "role:employee", `from:"${refs.bob}"`)).items,
    ).toHaveLength(1)
    await wcat("relationships", "end", added.id, "--end-date", "2026-09-30")
    expect((await wcat("relationships", "list", "role:employee", `from:"${refs.bob}"`)).items).toEqual([])
    expect((await wcat("relationships", "list", "role:employee", `from:"${refs.bob}"`, "include:ended")).items).toEqual(
      [expect.objectContaining({ id: added.id, standing: "ended" })],
    )
    await expect(wcat("organizations", "list", "category:friend")).rejects.toMatchObject({ code: "validation_error" })
  })

  it("keeps the owner's project on a CRM deal across the next sync", async () => {
    const root = mkdtempSync(join(tmpdir(), "wcat-crm-sync-"))
    const fresh = { ...env, MESSAGING_STORE: join(root, "m.db"), WCAT_CONFIG_DIR: join(root, "config") }
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
    await wcat("groups", "add", "work", PORTAL)
    vi.stubEnv("WCAT_GROUP_LOCK", "personal")
    const locked = memoIn({ ...env, WCAT_GROUP_LOCK: "personal" })
    await expect(locked("deals", "update", refs.deal.split(":")[1] as string, "--project", "")).rejects.toMatchObject({
      code: "permission_error",
    })
  })

  it("shows no relationship of the work deal, the owner's own included", async () => {
    await wcat("groups", "add", "work", PORTAL)
    const bob = await wcat("personal", "context", refs.bob)
    expect(JSON.stringify(bob.relationships)).not.toContain(refs.deal)
    expect(JSON.stringify(bob.business)).not.toContain(refs.deal)
  })

  it("shows the owner's own notes about a person and an organization in a work run", async () => {
    await wcat("groups", "add", "work", PORTAL)
    await addNote(env, "Alice prefers mornings", { subject: [refs.alice] })
    await addNote(env, "Acme pays late", { subject: [refs.acme] })
    vi.stubEnv("WCAT_GROUP_LOCK", "work")
    const work = memoIn({ ...env, WCAT_GROUP_LOCK: "work" })
    expect((await work("context", refs.alice)).your_notes).toHaveLength(1)
    expect((await work("organizations", "context", refs.acme)).notes.about).toHaveLength(1)
  })

  it("names no denied deal in a person's relationships", async () => {
    updateConfig((config) => ({ ...config, permissions: { deals: "deny" } }), env)
    const bob = await wcat("context", refs.bob)
    expect(JSON.stringify(bob.relationships)).not.toContain(refs.deal)
  })
})

describe("relationship roles: built in and the owner's own", () => {
  it("lists, adds and removes an owner role, and refuses a built-in or one in use", async () => {
    const listed = await wcat("relationships", "roles", "list", "list:organization")
    expect(listed.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "employee", built_in: true })]))
    const added = await wcat("relationships", "roles", "add", "organization", "board-member", "--label", "Board member")
    expect(added.items).toEqual(
      expect.arrayContaining([
        { list: "organization", id: "board-member", label: "Board member", labels: null, built_in: false },
      ]),
    )
    const link = await wcat("relationships", "add", refs.bob, refs.acme, "--role", "board-member")
    expect(link).toMatchObject({ role: "board-member" })
    expect((await wcat("relationships", "list", `from:"${refs.bob}"`, "role:board-member")).items[0].custom).toBe(false)
    await expect(wcat("relationships", "roles", "remove", "organization", "board-member")).rejects.toMatchObject({
      details: { reason: "relationship.role-in-use" },
    })
    await expect(wcat("relationships", "roles", "remove", "organization", "employee")).rejects.toMatchObject({
      code: "validation_error",
    })
    await wcat("relationships", "remove", link.id)
    await wcat("relationships", "roles", "remove", "organization", "board-member")
    expect(
      (await wcat("relationships", "roles", "list", "list:organization")).items.map(({ id }: { id: string }) => id),
    ).not.toContain("board-member")
  })

  it("lists the related roles with their labels in three languages", async () => {
    const related = await wcat("relationships", "roles", "list", "list:related")
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

  it("records an agent's terminal as the owner under --from-app; --as-owner gets no answer under --json", async () => {
    const agent = memoIn({ ...env, AI_AGENT: "test-agent" })
    const unconfirmed = { details: { reason: "decision.owner-unconfirmed" } }
    const add = ["relationships", "add", refs.bob, refs.acme, "--role", "employee"]
    await expect(agent(...add, "--as-owner")).rejects.toMatchObject(unconfirmed)
    const added = await agent(...add, "--end-date", "2026-03-31", "--from-app")
    expect(added).toMatchObject({ confirmed: true, ends_at: "2026-04-01T00:00:00.000Z" })

    const update = ["relationships", "update", added.id, "--position", "CTO", "--start-date", "2026-02-01"]
    await expect(agent(...update, "--as-owner")).rejects.toMatchObject(unconfirmed)
    expect(await agent(...update, "--from-app")).toMatchObject({
      position: "CTO",
      starts_at: "2026-02-01T00:00:00.000Z",
    })

    const store = await openStore({ env })
    const suggested = await store.knowledge.relate(null, {
      by: "owner",
      from: refs.alice,
      to: refs.bob,
      kind: "reports-to",
      confirmed: false,
      provenance: "agent:test-agent",
    })
    await store.close()
    await expect(agent("relationships", "confirm", suggested.id, "--as-owner")).rejects.toMatchObject(unconfirmed)
    expect(await agent("relationships", "confirm", suggested.id, "--from-app")).toMatchObject({ confirmed: true })

    await expect(agent("relationships", "end", suggested.id, "--as-owner")).rejects.toMatchObject(unconfirmed)
    expect(await agent("relationships", "end", suggested.id, "--end-date", "2026-09-30", "--from-app")).toMatchObject({
      ends_at: "2026-10-01T00:00:00.000Z",
    })

    await expect(agent("relationships", "remove", added.id, "--as-owner")).rejects.toMatchObject(unconfirmed)
    await agent("relationships", "remove", added.id, "--from-app")
    const left = await wcat("relationships", "list", `from:"${refs.bob}"`, "role:employee", "include:ended")
    expect(left.items.map(({ id }: { id: string }) => id)).not.toContain(added.id)

    const role = ["relationships", "roles", "add", "project", "sponsor"]
    await expect(agent(...role, "--as-owner")).rejects.toMatchObject(unconfirmed)
    expect((await agent(...role, "--from-app")).items).toContainEqual(expect.objectContaining({ id: "sponsor" }))
    await expect(agent("relationships", "roles", "remove", "project", "sponsor", "--as-owner")).rejects.toMatchObject(
      unconfirmed,
    )
    await agent("relationships", "roles", "remove", "project", "sponsor", "--from-app")
    const roles = await wcat("relationships", "roles", "list", "list:project")
    expect(roles.items.map(({ id }: { id: string }) => id)).not.toContain("sponsor")
  })

  it("lists the roles under the lock", async () => {
    vi.stubEnv("WCAT_GROUP_LOCK", "personal")
    expect(
      (await memoIn({ ...env, WCAT_GROUP_LOCK: "personal" })("relationships", "roles", "list", "list:deal")).items,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: "decision-maker" })]))
  })
})
