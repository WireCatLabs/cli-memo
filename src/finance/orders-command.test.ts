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

it("confirms the owner's order at once, keeps an agent's for review, and finds one shop's number", async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-orders-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  await store.close()
  const run = async (who: Record<string, string>, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...who }, terminal: { present: who === OWNER } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }

  const own = (await run(OWNER, "orders", "add", "Shop One", "2499", "RUB", "--kind", "personal", "--title", "A-1"))
    .item
  expect(own).toMatchObject({
    review: "confirmed",
    supplier_name: "Shop One",
    total: "2499.00",
    customer: { owner: true },
  })
  const proposed = (
    await run(
      AGENT,
      "orders",
      "add",
      "Office Supply",
      "--kind",
      "client",
      "--organization",
      client.ref,
      "--reason",
      "the shop confirms it",
    )
  ).item as { ref: string }
  expect(proposed).toMatchObject({ review: "proposed", purpose: "client", customer: { ref: client.ref } })

  expect((await run(OWNER, "orders", "list", "number:A-1", 'supplier:"shop one"')).items).toMatchObject([
    { number: "A-1" },
  ])
  expect((await run(OWNER, "review", "list", "kind:order")).items).toMatchObject([{ id: proposed.ref, kind: "order" }])
  expect((await run(OWNER, "orders", "show", proposed.ref)).item).toMatchObject({ status: "placed" })
})
