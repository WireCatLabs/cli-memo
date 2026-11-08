import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { syncCrm } from "@wirecat/cli-core/crm"
import { ACME_PORTAL, acmeScenario, fakeCrmSource } from "@wirecat/cli-core/crm/testing"
import { type AccountKey, openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { memoIn } from "../../test/memo.js"

const PORTAL = { provider: ACME_PORTAL.provider, account: ACME_PORTAL.account }
const OTHER = { provider: ACME_PORTAL.provider, account: "southwind.example" }

interface Row {
  title?: string
  name?: string
  account: AccountKey | null
  writes_with: unknown
}

let env: NodeJS.ProcessEnv

const withStore = async (work: (store: Awaited<ReturnType<typeof openStore>>) => Promise<unknown>) => {
  const store = await openStore({ env })
  try {
    await work(store)
  } finally {
    await store.close()
  }
}

const profiles = (named: Record<string, AccountKey>) =>
  withStore(async (store) => {
    for (const [profile, account] of Object.entries(named)) await store.accounts.saveProfile("b24", profile, account)
  })

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-writes-with-"))
  env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  await withStore(async (store) => {
    await acmeScenario(store)
    const other = fakeCrmSource()
    other.put("deal", { externalId: "d9", title: "Southwind pilot", pipeline: "deal-1", stage: "new" })
    await syncCrm(other, store, OTHER, { rescan: true })
    // After the scenario, which registers its portal with no command: b24 registers its own on every run.
    await store.accounts.registerProvider({ name: ACME_PORTAL.provider, kind: "crm", aliases: [], command: "b24" })
    await store.accounts.saveAccountGroup("work", [`${PORTAL.provider}:${PORTAL.account}`])
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const rowOf = (items: Row[], account: AccountKey) =>
  items.find((row) => row.account?.account === account.account) as Row

describe("writes_with on CRM rows (FIND-2416)", () => {
  it("names the one b24 profile on the row's account, and none on the owner's own row", async () => {
    await profiles({ work: PORTAL })
    const memo = memoIn(env)
    await memo("pipelines", "add", "Own", "Call", "won", "lost")
    await memo("deals", "add", "Own deal", "Own/Call")
    const { items } = (await memo("deals", "list")) as { items: Row[] }
    expect(rowOf(items, PORTAL).writes_with).toEqual({
      tool: "b24",
      account: PORTAL,
      profile: "work",
      profiles: ["work"],
      why: null,
    })
    expect(items.find((row) => row.title === "Own deal")).toMatchObject({ account: null, writes_with: null })
    const pipelines = (await memo("pipelines", "list")) as { items: Row[] }
    expect(rowOf(pipelines.items, PORTAL).writes_with).toMatchObject({ tool: "b24", profile: "work" })
    expect(pipelines.items.find((row) => row.name === "Own")).toMatchObject({ writes_with: null })
  })

  it("names no profile when two are on the account, and lists both for the owner to choose", async () => {
    await profiles({ work: PORTAL, sales: PORTAL })
    const { items } = (await memoIn(env)("deals", "list")) as { items: Row[] }
    expect(rowOf(items, PORTAL).writes_with).toEqual({
      tool: "b24",
      account: PORTAL,
      profile: null,
      profiles: expect.arrayContaining(["sales", "work"]),
      why: expect.stringContaining("the owner chooses one"),
    })
  })

  it("never names a profile whose account the run's group does not hold", async () => {
    await profiles({ work: PORTAL, south: OTHER })
    const all = (await memoIn(env)("pipelines", "list")) as { items: Row[] }
    expect(rowOf(all.items, OTHER).writes_with).toMatchObject({ profile: "south" })

    const inWork = (await memoIn(env)("work", "pipelines", "list")) as { items: Row[] }
    expect(inWork.items.map((row) => row.account?.account)).not.toContain(OTHER.account)
    expect(rowOf(inWork.items, PORTAL).writes_with).toMatchObject({ profile: "work", profiles: ["work"] })

    vi.stubEnv("MEMO_GROUP_LOCK", "work")
    const locked = (await memoIn({ ...env, MEMO_GROUP_LOCK: "work" })("deals", "list")) as { items: Row[] }
    expect(locked.items.map((row) => row.account?.account)).not.toContain(OTHER.account)
    expect(rowOf(locked.items, PORTAL).writes_with).toMatchObject({ profile: "work", profiles: ["work"] })
  })
})
