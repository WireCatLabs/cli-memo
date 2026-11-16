import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { syncCrm } from "@wirecat/cli-core/crm"
import { exampleDeal, fakeCrmSource } from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const PORTAL = { provider: "example-crm", account: "portal.example.test" }

/** A copy synced as CRM user 7, who is not its administrator, that also holds user 9's deal d2. */
const setUp = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-crm-viewer-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const store = await openStore({ env })
  let theirsRef = ""
  try {
    await store.accounts.registerProvider({ name: PORTAL.provider, kind: "crm", aliases: [] })
    const source = fakeCrmSource({ self: "7" })
    source.put("deal", exampleDeal("d1", { title: "Harbour renewal mine", assignee: "7" }))
    await syncCrm(source, store, PORTAL)
    // As an administrator's earlier sync of the same account would have left it.
    await store.crm.saveItems(PORTAL, "deal", [exampleDeal("d2", { title: "Harbour renewal theirs", assignee: "9" })], {
      users: false,
    })
    const copied = await store.deals.list({ accounts: [PORTAL] })
    theirsRef = copied.items.find(({ externalId }) => externalId === "d2")?.ref as string
  } finally {
    await store.close()
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: { present: false } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  await run("pipelines", "add", "Own sales", "Call", "won", "lost")
  await run("deals", "add", "Harbour renewal own", "Call")
  return { run, theirsRef }
}

it("shows a CRM copy as the user its sync signed in as: only that user's deals (SEC-197)", async () => {
  const { run, theirsRef } = await setUp()
  const titles = (answer: { items: { title: string }[] }) => answer.items.map(({ title }) => title).sort()

  expect(titles(await run("deals", "list"))).toEqual(["Harbour renewal mine", "Harbour renewal own"])
  const theirs = (await run("search", "all", "Harbour", "--exact")).items.map(({ title }: { title: string }) => title)
  expect(theirs).not.toContain("Harbour renewal theirs")
  expect(theirs).toContain("Harbour renewal mine")

  const copy = (await run("pipelines", "list", "kind:deal")).items.find(
    ({ account }: { account: unknown }) => account !== null,
  ) as { ref: string; stages: { open: number }[] }
  expect(copy.stages.reduce((sum, { open }) => sum + open, 0)).toBe(1)
  expect((await run("pipelines", "show", copy.ref)).item.totals).toMatchObject({ items: 1 })
  await expect(run("deals", "show", theirsRef)).rejects.toMatchObject({ code: "not_found" })
})
