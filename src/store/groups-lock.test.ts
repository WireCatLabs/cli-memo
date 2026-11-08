import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { syncCrm } from "@wirecat/cli-core/crm"
import { ACME_PORTAL, type AcmeScenario, acmeScenario, fakeCrmSource } from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { memoEnvelope, memoIn } from "../../test/memo.js"

const HOME = { provider: "telegram", account: "1" }
const WORK = { provider: "telegram", account: "2" }
const PORTAL = `${ACME_PORTAL.provider}:${ACME_PORTAL.account}`

const message = (id: string, sender: string, text: string) => ({
  id,
  chatId: sender,
  senderId: sender,
  senderName: null,
  timestamp: "2026-10-09T00:00:00Z",
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const refused = { code: "permission_error" }

let env: NodeJS.ProcessEnv
let refs: AcmeScenario["refs"]
let homeOnly: string

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-lock-"))
  env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const store = await openStore({ env })
  try {
    await store.accounts.registerProvider({ name: ACME_PORTAL.provider, kind: "crm", aliases: [] })
    refs = (await acmeScenario(store)).refs
    await store.sync.applyDelta(HOME, { people: [{ id: "301", name: "Kin Example" }] })
    await store.messages.saveMessages(HOME, "301", [message("1", "301", "Lockcase at home")], { via: "test" })
    await store.messages.saveMessages(WORK, "401", [message("1", "401", "Lockcase at work")], { via: "test" })
    await store.notes.addNote({ text: "Lockcase private thought" })
    homeOnly = `person:${(await store.people.personOf({ provider: "telegram", id: "301" }))?.uid}`
    await store.accounts.saveAccountGroup("work", ["telegram:2", PORTAL])
    await store.accounts.saveAccountGroup("personal", ["telegram:1"])
  } finally {
    await store.close()
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const lockedTo = (group: string) => {
  vi.stubEnv("MEMO_GROUP_LOCK", group)
  return memoIn({ ...env, MEMO_GROUP_LOCK: group })
}

describe("MEMO_GROUP_LOCK fails closed", () => {
  it("refuses a write that names an outside account's message", async () => {
    const memo = lockedTo("work")
    await expect(memo("tags", "add", "x", "--message", "msg:telegram/1/301/1")).rejects.toMatchObject(refused)
  })

  it("refuses a relationship to a person only an outside account saw", async () => {
    const memo = lockedTo("work")
    await expect(memo("relationships", "add", homeOnly, refs.acme)).rejects.toMatchObject(refused)
  })

  it("shows the owner's own notes in a work run: owner-made data is in every group", async () => {
    const memo = lockedTo("work")
    expect((await memo("search", "notes", "Lockcase")).items).toEqual([expect.objectContaining({ ref: "note:1" })])
    expect((await memo("notes", "list", "source:internal")).items).toEqual([
      expect.objectContaining({ text: "Lockcase private thought" }),
    ])
  })

  it("refuses the context and the reference of a person only an outside account saw", async () => {
    const memo = lockedTo("work")
    await expect(memo("context", homeOnly)).rejects.toMatchObject(refused)
    await expect(memo("show", homeOnly)).rejects.toMatchObject(refused)
  })

  it("lists only the locked group", async () => {
    const memo = lockedTo("work")
    expect((await memo("groups", "list")).items.map(({ group }: { group: string }) => group)).toEqual(["work"])
  })

  it("shows a personal run none of a work CRM's deals, organizations or people", async () => {
    const memo = lockedTo("personal")
    expect((await memo("deals", "list")).items).toEqual([])
    await expect(memo("deals", "show", refs.deal)).rejects.toMatchObject(refused)
    expect((await memo("organizations", "list")).items.map(({ ref }: { ref: string }) => ref)).not.toContain(refs.acme)
    expect((await memo("people", "list")).items.map(({ ref }: { ref: string }) => ref)).not.toContain(refs.emma)
  })

  it("checks a bare id as the thing it names, and lets the owner's own note through (NEW-1)", async () => {
    const memo = lockedTo("personal")
    const id = refs.acme.split(":")[1] as string
    for (const args of [
      ["organizations", "show", id],
      ["organizations", "context", id],
      ["organizations", "rename", id, "Renamed"],
      ["deals", "show", refs.deal.split(":")[1] as string],
    ])
      await expect(memo(...args)).rejects.toMatchObject(refused)
    const work = lockedTo("work")
    const note = await memoIn(env)("notes", "add", "Lockcase home note")
    await expect(work("tags", "add", "x", "--note", note.id)).resolves.toBeDefined()
    await expect(work("tags", "add", "x", "--person", homeOnly.split(":")[1] as string)).rejects.toMatchObject(refused)
  })

  it("refuses a calendar event of an account outside the group (NEW-5)", async () => {
    const memo = lockedTo("work")
    await expect(memo("show", refs.event)).rejects.toMatchObject(refused)
  })

  it("narrows a group to the mailboxes a mail search reads (NEW-7)", async () => {
    await expect(memoIn(env)("work", "search", "mail", "renewal")).rejects.toMatchObject({
      code: "not_found",
      message: "group:work holds no mailbox",
    })
    await memoIn(env)("groups", "add", "work", "email:owner@northstar.example")
    const found = await memoIn(env)("work", "search", "mail", "renewal")
    expect(found.items.length).toBeGreaterThan(0)
  })

  it("runs every group-aware command whose arguments are free text, numbers included", async () => {
    await memoIn(env)("pipelines", "add", "Lockflow", "Call", "Quote", "won", "lost")
    const memo = lockedTo("work")
    const acme = refs.acme.split(":")[1] as string
    for (const args of [
      ["search", "all", "Lockcase", "2026", "--exact"],
      ["search", "messages", "Lockcase", "2026"],
      ["search", "people", "Emma"],
      ["groups", "list"],
      ["tags", "add", "lock-2026", "--message", "msg:telegram/2/401/1"],
      ["tags", "remove", "lock-2026", "--message", "msg:telegram/2/401/1"],
      ["deals", "list", "status:open"],
      ["deals", "add", "Lock deal", "Lockflow/Call", "100.00", "EUR"],
      ["leads", "list"],
      ["organizations", "list", "name:*acme*"],
      ["organizations", "add", "Lock 2026", "--kind", "company"],
      ["organizations", "rename", acme, "Acme 2026"],
      ["people", "list"],
      ["people", "add", "Lock Person 2026"],
      ["notes", "list"],
      ["relationships", "list", "confirmed:true"],
    ])
      await expect(memo(...args), args.join(" ")).resolves.toBeDefined()
  })

  it("refuses a relationship id in any spelling, by the lock itself", async () => {
    const memo = lockedTo("work")
    for (const args of [
      ["relationships", "confirm", "link:1"],
      ["relationships", "remove", "1e0"],
      ["relationships", "update", "1", "--role", "contact"],
    ])
      await expect(memo(...args), args.join(" ")).rejects.toMatchObject({
        code: "permission_error",
        message: expect.stringContaining("locked to group work"),
      })
  })

  it("runs memories, facts, tasks and a work project's context and status under the lock", async () => {
    const owner = memoIn(env)
    const project = await owner("projects", "add", "Lockwork", "--key", "LKW")
    await owner("relationships", "add", "chat:telegram/2/401", project.ref)
    await owner("relationships", "add", "chat:telegram/1/301", project.ref)
    const memo = lockedTo("work")
    for (const args of [
      ["memories", "list"],
      ["facts", "list"],
      ["tasks", "list"],
      ["actions", "list"],
    ])
      await expect(memo(...args), args.join(" ")).resolves.toBeDefined()
    const context = await memo("projects", "context", "LKW")
    const chats = context.relationships.map(({ from }: { from: string }) => from)
    expect(chats).toContain("chat:telegram/2/401")
    expect(chats).not.toContain("chat:telegram/1/301")
    const status = JSON.stringify(await memo("projects", "status", "LKW"))
    expect(status).not.toContain("Lockcase at home")
    expect(status).not.toContain("telegram/1/")
    expect(status).not.toContain("Kin Example")
    expect(await memoEnvelope({ ...env, MEMO_GROUP_LOCK: "work" })("projects", "status", "LKW")).toMatchObject({
      missing: expect.arrayContaining([
        { field: "out_of_scope", why: "1 of the project's chats are outside group work" },
      ]),
    })
    vi.unstubAllEnvs()
    expect((await owner("work", "projects", "status", "LKW")).out_of_scope).toEqual([
      { chat: "chat:telegram/1/301", reason: "other-account" },
    ])
  })
})

describe("pipelines in a group", () => {
  const SOUTHWIND = { provider: ACME_PORTAL.provider, account: "southwind.example" }
  let outside: string

  beforeEach(async () => {
    const store = await openStore({ env })
    try {
      const source = fakeCrmSource()
      source.put("deal", { externalId: "d9", title: "Southwind pilot", pipeline: "deal-1", stage: "new" })
      await syncCrm(source, store, SOUTHWIND, { rescan: true })
      const sales = await store.deals.pipelines({ kind: "deal", account: SOUTHWIND })
      outside = (sales[0] as { ref: string }).ref
    } finally {
      await store.close()
    }
  })

  const accountsOf = (items: { account: { account: string } | null }[]) =>
    [...new Set(items.map((one) => one.account?.account ?? "own"))].sort()

  it("lists and shows only the group's pipelines and the owner's under MEMO_GROUP_LOCK", async () => {
    const memo = lockedTo("work")
    expect(accountsOf((await memo("pipelines", "list")).items)).toEqual([ACME_PORTAL.account, "own"])
    expect(await memo("pipelines", "show", "Example sales")).toMatchObject({ account: ACME_PORTAL })
    await expect(memo("pipelines", "show", outside)).rejects.toMatchObject(refused)
    await expect(lockedTo("personal")("pipelines", "show", "Example sales")).rejects.toMatchObject({
      code: "not_found",
    })
  })

  it("lists and shows only the group's pipelines under the group word", async () => {
    const memo = memoIn(env)
    expect(accountsOf((await memo("pipelines", "list")).items)).toEqual([ACME_PORTAL.account, "own", SOUTHWIND.account])
    expect(accountsOf((await memo("work", "pipelines", "list")).items)).toEqual([ACME_PORTAL.account, "own"])
    await expect(memo("pipelines", "show", "Example sales")).rejects.toMatchObject({ code: "validation_error" })
    expect(await memo("work", "pipelines", "show", "Example sales")).toMatchObject({ account: ACME_PORTAL })
    await expect(memo("personal", "pipelines", "show", "Example sales")).rejects.toMatchObject({
      code: "not_found",
      message: "no pipeline named Example sales in group:personal",
    })
  })
})
