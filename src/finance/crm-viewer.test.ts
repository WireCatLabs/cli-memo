import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { syncCrm } from "@wirecat/cli-core/crm"
import {
  exampleDeal,
  exampleOrganization,
  examplePerson,
  type FakeCrmSourceOptions,
  fakeCrmSource,
} from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { sideOf } from "../people/review-context.js"
import { createProgram } from "../program.js"

const PORTAL = { provider: "example-crm", account: "portal.example.test" }
const HOUR = 3_600_000

/**
 * A copy synced as CRM user 7, who is not its administrator, that also holds deals of user 9 made after 7's, so a
 * list newest first meets theirs first. The owner keeps a deal of his own beside it.
 */
const setUp = async (crm: FakeCrmSourceOptions = { self: "7" }, theirs = 1) => {
  const dir = mkdtempSync(join(tmpdir(), "memo-crm-viewer-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const store = await openStore({ env })
  let mineRef = ""
  let theirsRef = ""
  let projectRef = ""
  let organizationRef = ""
  let personRef = ""
  try {
    await store.accounts.registerProvider({ name: PORTAL.provider, kind: "crm", aliases: [] })
    const source = fakeCrmSource(crm)
    const now = Date.now()
    const pier = { organization: "c1", people: [{ externalId: "p1", role: "contact" as const, primary: true }] }
    source.put("organization", exampleOrganization("c1", { name: "Pier Co" }))
    source.put("person", examplePerson("p1", { name: "Ann Pier" }))
    source.put(
      "deal",
      exampleDeal("d1", { title: "Harbour renewal mine", assignee: "7", createdAt: now - HOUR, ...pier }),
    )
    await syncCrm(source, store, PORTAL)
    // As an administrator's earlier sync of the same account would have left them.
    const deals = Array.from({ length: theirs }, (_, at) =>
      exampleDeal(`t${at}`, {
        title: `Harbour renewal theirs ${at}`,
        assignee: "9",
        createdAt: now - at * 1000,
        ...pier,
      }),
    )
    await store.crm.saveItems(PORTAL, "deal", deals, { users: false })
    const copied = await store.deals.list({ accounts: [PORTAL], limit: 500 })
    mineRef = copied.items.find(({ externalId }) => externalId === "d1")?.ref as string
    const held = copied.items.find(({ externalId }) => externalId === "t0")
    theirsRef = held?.ref as string
    organizationRef = held?.organization?.ref as string
    personRef = held?.people[0]?.ref as string
    projectRef = (await store.knowledge.addProject({ name: "Harbour", key: "HRB" })).ref
  } finally {
    await store.close()
  }
  const call = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: { present: false } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return { body: envelopeOf(streams.stdout.join("")), stderr: streams.stderr.join("") }
  }
  const run = async (...args: string[]) => (await call(...args)).body
  await run("pipelines", "add", "Own sales", "Call", "won", "lost")
  await run("deals", "add", "Harbour renewal own", "Call")
  const inStore = async <T>(work: (opened: Awaited<ReturnType<typeof openStore>>) => Promise<T>) => {
    const opened = await openStore({ env })
    try {
      return await work(opened)
    } finally {
      await opened.close()
    }
  }
  return {
    env,
    inStore,
    run,
    call,
    mineRef,
    theirsRef,
    organizationRef,
    personRef,
    theirs: () => inStore((opened) => opened.deals.get(theirsRef)),
    // Set before the viewer rule existed, or by the administrator's own memo.
    tagTheirs: () => inStore((opened) => opened.deals.setProject(theirsRef, { project: projectRef, by: "owner" })),
  }
}

const titles = (answer: { items: { title: string }[] }) => answer.items.map(({ title }) => title).sort()
const hidden = { code: "not_found", details: { reason: "deal.not-readable" } }

it("shows a CRM copy as the user its sync signed in as: only that user's deals (SEC-197)", async () => {
  const { run, theirsRef } = await setUp()

  expect(titles(await run("deals", "list"))).toEqual(["Harbour renewal mine", "Harbour renewal own"])
  const found = (await run("search", "all", "Harbour", "--exact")).items.map(({ title }: { title: string }) => title)
  expect(found).not.toContain("Harbour renewal theirs 0")
  expect(found).toContain("Harbour renewal mine")

  const copy = (await run("pipelines", "list", "kind:deal")).items.find(
    ({ account }: { account: unknown }) => account !== null,
  ) as { ref: string; stages: { open: number }[] }
  expect(copy.stages.reduce((sum, { open }) => sum + open, 0)).toBe(1)
  expect((await run("pipelines", "show", copy.ref)).item.totals).toMatchObject({ items: 1 })
  await expect(run("deals", "show", theirsRef)).rejects.toMatchObject(hidden)
  await expect(run("deals", "context", theirsRef)).rejects.toMatchObject({ code: "not_found" })
})

it("neither changes nor prints another user's deal on update, move or close", async () => {
  const { run, theirsRef, theirs } = await setUp()
  await expect(run("deals", "update", theirsRef, "--project", "HRB")).rejects.toMatchObject(hidden)
  await expect(run("deals", "move", theirsRef, "Quote sent")).rejects.toMatchObject(hidden)
  await expect(run("deals", "close", theirsRef, "lost")).rejects.toMatchObject(hidden)
  expect(await theirs()).toMatchObject({ project: null, stage: "New", status: "open" })
})

it("fills a deals page past the rows it hides", async () => {
  const { run } = await setUp({ self: "7" }, 5)
  const page = await run("deals", "list", "--limit", "1")
  expect(titles(page)).toEqual(["Harbour renewal own"])
  expect(page.page.has_more).toBe(true)
  expect(titles(await run("deals", "list", "--limit", "2"))).toEqual(["Harbour renewal mine", "Harbour renewal own"])
})

it("counts only the readable deals among a project's open deals", async () => {
  const { run, mineRef, tagTheirs } = await setUp()
  await run("deals", "update", mineRef, "--project", "HRB")
  await tagTheirs()
  const status = (await run("projects", "status", "HRB")).item as { deals: { ref: string }[] }
  expect(status.deals.map(({ ref }) => ref)).toEqual([mineRef])
})

it("marks only the hidden reference unavailable in show, and names nothing of it", async () => {
  const { run, mineRef, theirsRef } = await setUp()
  const shown = (await run("show", theirsRef, mineRef)).items as { ref: string; state: string; title: string | null }[]
  expect(shown.map(({ ref, state, title }) => [ref, state, title])).toEqual([
    [theirsRef, "unavailable", null],
    [mineRef, "available", "Harbour renewal mine · New"],
  ])
})

it("says why a copy whose sync named no user shows none of its deals, and calls the answer incomplete", async () => {
  const { call, organizationRef, personRef } = await setUp({ admin: false })
  const listed = await call("deals", "list")
  expect(titles(listed.body)).toEqual(["Harbour renewal own"])
  expect(listed.body.meta.complete).toBe(false)
  expect(listed.stderr).toContain("names no CRM user")
  const pipelines = await call("pipelines", "list", "kind:deal")
  expect(pipelines.body.meta.complete).toBe(false)
  expect(pipelines.stderr).toContain("names no CRM user")
  const copy = pipelines.body.items.find(({ account }: { account: unknown }) => account !== null) as { ref: string }
  const funnel = await call("pipelines", "show", copy.ref)
  expect(funnel.body.meta.complete).toBe(false)
  expect(funnel.body.item.totals).toMatchObject({ items: 0 })
  const found = await call("search", "all", "Harbour", "--exact")
  expect(found.body.meta.complete).toBe(false)
  expect(found.stderr).toContain("names no CRM user")
  for (const args of [
    ["organizations", "context", organizationRef],
    ["context", personRef],
    ["relationships", "list"],
  ]) {
    const answer = await call(...args)
    expect(answer.body.meta.complete, args.join(" ")).toBe(false)
    expect(answer.stderr, args.join(" ")).toContain("names no CRM user")
  }
})

it("names no hidden deal in the contexts and relationships around it", async () => {
  const { run, organizationRef, personRef, mineRef, inStore, env } = await setUp()
  expect(organizationRef).toMatch(/^organization:/)
  expect(personRef).toMatch(/^person:/)
  const said = async (...args: string[]) => JSON.stringify(await run(...args))
  for (const args of [
    ["organizations", "context", organizationRef],
    ["context", personRef],
    ["relationships", "list"],
    ["relationships", "list", `about:${personRef}`],
    ["deals", "context", mineRef],
  ])
    expect(await said(...args), args.join(" ")).not.toContain("theirs")
  const around = (await run("context", personRef)).item.relationships as { from: string }[]
  expect(around.map(({ from }) => from)).toEqual([mineRef])
  const side = await inStore((store) => sideOf(store, env, personRef, "full", []))
  expect(JSON.stringify(side), "people review's side").not.toContain("theirs")
  expect(JSON.stringify(side)).toContain("Harbour renewal mine")
})
