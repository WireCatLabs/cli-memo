import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { syncCrm } from "@wirecat/cli-core/crm"
import { ACME_PORTAL, acmeScenario, fakeCrmSource } from "@wirecat/cli-core/crm/testing"
import { type AccountKey, openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { memoIn } from "../../test/memo.js"
import { createProgram } from "../program.js"

const PORTAL = { provider: ACME_PORTAL.provider, account: ACME_PORTAL.account }
const OTHER = { provider: ACME_PORTAL.provider, account: "southwind.example" }

interface Column {
  ref: string
  name: string
  outcome: string
  open: number
}
interface BaseSet {
  stages: Column[]
  unsorted: { open: number; stages: number }
}
interface Mapping {
  ref: string
  name: string
  pipeline_name: string
  account: AccountKey | null
  confirmed: boolean
}
interface Row {
  ref: string
  title: string
  stage: string
  account: AccountKey | null
  base_stage: { ref: string; name: string } | null
}

let env: NodeJS.ProcessEnv

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-base-stages-"))
  env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const store = await openStore({ env })
  try {
    await acmeScenario(store)
    const other = fakeCrmSource()
    other.put("deal", { externalId: "d9", title: "Southwind pilot", pipeline: "deal-1", stage: "new" })
    await syncCrm(other, store, OTHER, { rescan: true })
    await store.accounts.registerProvider({ name: ACME_PORTAL.provider, kind: "crm", aliases: [], command: "b24" })
    await store.accounts.saveAccountGroup("work", [`${PORTAL.provider}:${PORTAL.account}`])
  } finally {
    await store.close()
  }
})

const openColumns = async (memo = memoIn(env)) =>
  ((await memo("stages", "show", "deal")) as BaseSet).stages.filter((column) => column.outcome === "open")

/** The own pipeline Own (Call, Quote, Contract, won, lost) with one deal in Call, by stage name. */
const ownPipeline = async () => {
  const memo = memoIn(env)
  await memo("pipelines", "add", "Own", "Call", "Quote", "Contract", "won", "lost")
  const deal = (await memo("deals", "add", "Own deal", "Own/Call")) as Row
  const { items } = (await memo("stages", "list", "pipeline:Own")) as { items: Mapping[] }
  const stage = (name: string) => (items.find((one) => one.name === name) as Mapping).ref
  return { memo, deal: deal.ref, stage }
}

describe("memo stages", () => {
  it("mounts every stages command with --json", async () => {
    const stages = createProgram({ streams: captureStreams(), env }).commands.find((one) => one.name() === "stages")
    const leaves = stages?.commands ?? []
    expect(leaves.map((leaf) => leaf.name())).toEqual(
      expect.arrayContaining(["confirm", "create", "list", "move", "remove", "rename", "set", "show"]),
    )
    for (const leaf of leaves) expect(leaf.options.map((option) => option.long)).toContain("--json")
    const columns = await openColumns()
    expect(columns.length).toBeGreaterThanOrEqual(3)
    expect(columns[0]?.ref).toMatch(/^stage:\d+$/)
  })

  it("refuses an agent's edit of the base set and its confirm, and keeps its mapping a suggestion", async () => {
    const [, column] = await openColumns()
    const { stage } = await ownPipeline()
    const agent = memoIn({ ...env, AI_AGENT: "codex" })
    const ownerOnly = { code: "permission_error", details: { reason: "stage.owner-only" } }
    await expect(agent("stages", "create", "deal", "Demo")).rejects.toMatchObject(ownerOnly)
    await expect(agent("stages", "rename", "deal", (column as Column).ref, "Quote sent")).rejects.toMatchObject(
      ownerOnly,
    )
    await expect(agent("stages", "confirm", "--all")).rejects.toMatchObject(ownerOnly)
    const suggested = (await agent("stages", "set", stage("Quote"), (column as Column).ref)) as Mapping
    expect(suggested.confirmed).toBe(false)
    const owned = (await memoIn(env)("stages", "set", stage("Quote"), (column as Column).ref)) as Mapping
    expect(owned.confirmed).toBe(true)
  })

  it("keeps a locked group's counts and mappings to its own accounts", async () => {
    const all = (await memoIn(env)("stages", "list")) as { items: Mapping[] }
    expect(all.items.map((one) => one.account?.account)).toContain(OTHER.account)
    const allSet = (await memoIn(env)("stages", "show", "deal")) as BaseSet

    const locked = memoIn({ ...env, MEMO_GROUP_LOCK: "work" })
    const inWork = (await locked("stages", "list")) as { items: Mapping[] }
    expect(inWork.items.length).toBeGreaterThan(0)
    expect(inWork.items.map((one) => one.account?.account)).not.toContain(OTHER.account)
    const workSet = (await locked("stages", "show", "deal")) as BaseSet
    // Southwind's open deal stands in an unconfirmed stage: only the run that sees its account counts it.
    expect(workSet.unsorted.open).toBe(allSet.unsorted.open - 1)
  })
})

describe("memo stages: the owner's base set and the suggestions", () => {
  it("puts a new base stage first, then takes it out of the set", async () => {
    const memo = memoIn(env)
    await memo("stages", "create", "deal", "Demo")
    const moved = (await memo("stages", "move", "deal", "Demo", "1")) as BaseSet
    expect(moved.stages[0]?.name).toBe("Demo")
    const removed = (await memo("stages", "remove", "deal", "Demo")) as BaseSet
    expect(removed.stages.map((column) => column.name)).not.toContain("Demo")
  })

  it("confirms only the kind named with --all --kind", async () => {
    const memo = memoIn(env)
    const unconfirmed = async (kind: string) =>
      ((await memo("stages", "list", `kind:${kind}`, "confirmed:false")) as { items: Mapping[] }).items.length
    const deals = await unconfirmed("deal")
    expect(deals).toBeGreaterThan(0)
    await memo("stages", "confirm", "--all", "--kind", "lead")
    expect(await unconfirmed("deal")).toBe(deals)
    expect(await unconfirmed("lead")).toBe(0)
    await memo("stages", "confirm", "--all", "--kind", "deal")
    expect(await unconfirmed("deal")).toBe(0)
  })

  it("prints the task for an agent, records the agent's answer, and asks a model only when one is chosen", async () => {
    const task = (await memoIn(env)("stages", "suggest", "--kind", "deal", "--dry-run")) as {
      stages: { ref: string; kind: string; outcome: string }[]
      base_stages: { ref: string; kind: string; outcome: string }[]
    }
    expect(task.stages.length).toBeGreaterThan(0)
    expect(task.stages.every((stage) => stage.kind === "deal")).toBe(true)
    const stage = task.stages[0] as { ref: string; outcome: string }
    const base = task.base_stages.find((one) => one.kind === "deal" && one.outcome === stage.outcome)
    const answer = join(mkdtempSync(join(tmpdir(), "memo-stage-answer-")), "answer.json")
    writeFileSync(answer, JSON.stringify({ map: [{ stage: stage.ref, base: base?.ref }] }))

    const agent = memoIn({ ...env, AI_AGENT: "codex" })
    expect(await agent("stages", "suggest", "--kind", "deal", "--text-file", answer)).toMatchObject({
      by: "agent",
      suggested: 1,
    })
    await expect(agent("stages", "suggest")).rejects.toMatchObject({ details: { reason: "stage.model-agent" } })
    await expect(memoIn(env)("stages", "suggest")).rejects.toMatchObject({ details: { reason: "ai.not-set" } })
  })
})

describe("deals move to a base stage", () => {
  it("moves the owner's deal to the one stage mapped there, and its row carries base_stage", async () => {
    const [column] = await openColumns()
    const { memo, deal, stage } = await ownPipeline()
    await memo("stages", "set", stage("Quote"), (column as Column).ref)

    const moved = (await memo("deals", "move", deal, (column as Column).ref)) as Row
    expect(moved).toMatchObject({ stage: "Quote", base_stage: { ref: (column as Column).ref } })

    const { items } = (await memo("deals", "list")) as { items: Row[] }
    expect(items.find((row) => row.ref === deal)?.base_stage).toEqual({
      ref: (column as Column).ref,
      name: (column as Column).name,
    })
    // The scenario's CRM stages are only suggested until the owner confirms them.
    expect(items.find((row) => row.account?.account === PORTAL.account)?.base_stage).toBeNull()
  })

  it("asks which stage when several are mapped there, and moves to the one named back", async () => {
    const [, column] = await openColumns()
    const { memo, deal, stage } = await ownPipeline()
    await memo("stages", "set", stage("Quote"), (column as Column).ref)
    await memo("stages", "set", stage("Contract"), (column as Column).ref)

    const failure = await memo("deals", "move", deal, (column as Column).ref).catch((error: unknown) => error)
    expect(failure).toMatchObject({
      code: "validation_error",
      details: {
        reason: "stage.choice-required",
        candidates: [
          { ref: stage("Quote"), name: "Quote" },
          { ref: stage("Contract"), name: "Contract" },
        ],
      },
    })
    expect(await memo("deals", "move", deal, stage("Contract"))).toMatchObject({ stage: "Contract" })
  })

  it("refuses a base stage nothing of the pipeline maps to, and a CRM's copy", async () => {
    const [, , column] = await openColumns()
    const { memo, deal } = await ownPipeline()
    await expect(memo("deals", "move", deal, (column as Column).ref)).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "stage.unmapped" },
    })
    expect(((await memo("deals", "show", deal)) as Row).stage).toBe("Call")

    const { items } = (await memo("deals", "list")) as { items: Row[] }
    const copy = items.find((row) => row.account?.account === PORTAL.account) as Row
    await expect(memo("deals", "move", copy.ref, (column as Column).ref)).rejects.toMatchObject({
      code: "validation_error",
      details: { reason: "stage.crm-copy", writes_with: { tool: "b24" } },
    })
  })
})
