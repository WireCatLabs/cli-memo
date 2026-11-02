import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"

const OWNER: Terminal = { present: true }

const setUp = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-records-import-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  await store.close()
  const header = { schema_version: 1, source: { provider: "sheet", account: "synthetic-rental", batch_id: "b1" } }
  const record = {
    key: "p-1",
    type: "payment",
    external_id: "платёж-1",
    operation: "upsert",
    fields: { direction: "in", currency: "RUB", date: "2026-11-01", amount: "50000.00", payer: client.ref },
  }
  const file = join(dir, "payments.jsonl")
  writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(record)}\n`)
  const answer = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: OWNER })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  const run = async (...args: string[]) => (await answer(...args)).item as Record<string, unknown>
  return { run, answer, file }
}

it("imports a JSONL file once as a proposal, never confirmed money, and a second import changes nothing", async () => {
  const f = await setUp()
  expect(await f.run("records", "check", f.file, "--account", "synthetic-rental")).toMatchObject({
    dry_run: true,
    created: 1,
  })
  expect((await f.answer("payments", "list")).items).toEqual([])

  const first = await f.run("records", "import", f.file, "--account", "synthetic-rental")
  expect(first).toMatchObject({ dry_run: false, created: 1, errors: [] })
  const [ref] = first.proposed as string[]
  expect(await f.run("payments", "show", ref as string)).toMatchObject({ review: "proposed", amount: "50000.00" })

  expect(await f.run("records", "import", f.file, "--account", "synthetic-rental")).toMatchObject({
    created: 0,
    updated: 0,
    unchanged: 1,
    proposed: [],
  })
  const refused = await f.run("records", "import", f.file, "--account", "someone-else")
  expect(refused.errors).toEqual([expect.objectContaining({ code: "envelope.account-mismatch" })])
})
