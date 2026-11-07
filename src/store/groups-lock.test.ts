import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ACME_PORTAL, type AcmeScenario, acmeScenario } from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { memoIn } from "../../test/memo.js"

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

  it("keeps the owner's own notes out of a work run", async () => {
    const memo = lockedTo("work")
    const found = await memo("search", "notes", "Lockcase").catch((error: { code: string }) => error)
    if ("items" in found) expect(found.items).toEqual([])
    else expect(found).toMatchObject(refused)
    await expect(memo("notes", "list", "source:internal")).rejects.toMatchObject(refused)
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
})
