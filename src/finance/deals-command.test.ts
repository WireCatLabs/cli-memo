import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"

import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const AGENT = { AI_AGENT: "claude-code_2-1-296_agent" }

it("lets an agent make a pipeline, add, move and close deals and leads, and counts the funnel", async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-deals-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  const project = await store.knowledge.addProject({ name: "Clinic", key: "CLN" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...AGENT }, terminal: { present: false } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }

  const sales = (await run("pipelines", "add", "Продажи", "Звонок", "КП", "won", "lost")).item as { ref: string }
  expect(sales).toMatchObject({
    name: "Продажи",
    kind: "deal",
    stages: [{ name: "Звонок" }, { name: "КП" }, { name: "won", outcome: "won" }, { name: "lost", outcome: "lost" }],
  })
  const deal = (
    await run("deals", "add", "Сайт", "Звонок", "500000", "RUB", "--organization", client.ref, "--project", "CLN")
  ).item as { ref: string }
  expect(deal).toMatchObject({ status: "open", amount: "500000.00", project: project.ref, author: { type: "bot" } })
  expect((await run("deals", "move", deal.ref, "кп")).item).toMatchObject({ stage: "КП" })
  expect((await run("projects", "status", "CLN")).item).toMatchObject({
    deals: [{ ref: deal.ref, stage: "КП", amount: "500000.00", currency: "RUB" }],
  })
  expect((await run("deals", "close", deal.ref, "won", "--reason", "signed")).item).toMatchObject({
    status: "won",
    stage: "won",
    closed_reason: "signed",
  })
  expect((await run("projects", "status", "CLN")).item).not.toHaveProperty("deals")
  expect((await run("pipelines", "show", sales.ref)).item).toMatchObject({
    stages: [{ name: "Звонок", reached: 1, conversion: 1 }, { name: "КП", reached: 1, conversion: 1 }, {}, {}],
    totals: { items: 1, won: 1, win_rate: 1 },
  })

  const lead = (await run("leads", "add", "Звонок с сайта")).item as { ref: string }
  expect(lead).toMatchObject({ kind: "lead", pipeline_name: "Leads", stage: "new" })
  expect((await run("leads", "list", "status:open")).items).toMatchObject([{ ref: lead.ref }])
})
