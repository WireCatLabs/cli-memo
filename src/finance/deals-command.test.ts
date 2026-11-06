import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"

import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const AGENT = { AI_AGENT: "claude-code_2-1-296_agent" }
const OWNER = {}

it("records the owner's deal at once, keeps an agent's for review, and lets only the owner move and close one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-deals-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  const project = await store.knowledge.addProject({ name: "Clinic", key: "CLN" })
  await store.close()
  const run = async (who: Record<string, string>, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...who }, terminal: { present: who === OWNER } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }

  expect((await run(OWNER, "pipelines", "add", "Продажи", "Звонок", "КП", "Договор")).item).toMatchObject({
    name: "Продажи",
    stages: [{ name: "Звонок" }, { name: "КП" }, { name: "Договор" }],
  })
  const own = (
    await run(
      OWNER,
      "deals",
      "add",
      "Сайт",
      "Звонок",
      "500000",
      "RUB",
      "--organization",
      client.ref,
      "--project",
      "CLN",
    )
  ).item as { ref: string }
  expect(own).toMatchObject({ review: "confirmed", status: "open", amount: "500000.00", project: project.ref })

  const proposed = (await run(AGENT, "deals", "add", "Поддержка", "КП", "--reason", "the client asked")).item as {
    ref: string
  }
  expect(proposed).toMatchObject({ review: "proposed" })
  expect((await run(OWNER, "review", "list", "kind:deal")).items).toMatchObject([{ id: proposed.ref, kind: "deal" }])
  await expect(run(AGENT, "deals", "move", own.ref, "КП")).rejects.toThrow()

  expect((await run(OWNER, "deals", "move", own.ref, "кп")).item).toMatchObject({ stage: "КП" })
  expect((await run(OWNER, "deals", "list", "status:open", "project:CLN")).items).toMatchObject([{ ref: own.ref }])
  expect((await run(OWNER, "projects", "status", "CLN")).item).toMatchObject({
    deals: [{ ref: own.ref, stage: "КП", amount: "500000.00", currency: "RUB" }],
  })
  expect((await run(OWNER, "deals", "close", own.ref, "lost", "--reason", "too expensive")).item).toMatchObject({
    status: "lost",
    stage: "КП",
    closed_reason: "too expensive",
  })
  expect((await run(OWNER, "projects", "status", "CLN")).item).not.toHaveProperty("deals")
})
