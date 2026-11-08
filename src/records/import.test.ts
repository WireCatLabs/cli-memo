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

// cli-core 0.607.0 matches or makes the organization a record names, so nothing waits; #713 rewrites this for it.
it.skip("lists records waiting for a party, refuses an agent's mapping and turns the owner's into a proposal", async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-records-map-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  await store.close()
  const file = join(dir, "sheet.json")
  writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      source: { provider: "sheet", account: "synthetic-rental", batch_id: "b1" },
      records: [
        { key: "c", type: "organization", external_id: "client", operation: "upsert", fields: { name: "ООО Пример" } },
        {
          key: "i",
          type: "invoice",
          external_id: "счёт-1",
          operation: "upsert",
          fields: { direction: "receivable", currency: "RUB", lines: [{ description: "Аренда", amount: "100.00" }] },
          relations: [{ role: "counterparty", type: "organization", external_id: "client" }],
        },
      ],
    }),
  )
  const run = async (who: Record<string, string>, terminal: Terminal, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...who }, terminal })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  const source = ["--account", "sheet:synthetic-rental"]
  expect((await run({}, OWNER, "records", "import", file, ...source)).item).toMatchObject({ proposed: [] })
  const waiting = await run({}, OWNER, "records", "list", "waiting:true", ...source)
  expect((waiting.items as { external_id: string }[]).map((one) => one.external_id)).toEqual(["счёт-1"])

  const agent = { AI_AGENT: "codex" }
  await expect(
    run(agent, { present: false }, "records", "link", "organization:client", client.ref, ...source),
  ).rejects.toMatchObject({ code: "permission_error" })

  const mapped = await run({}, OWNER, "records", "link", "organization:client", client.ref, ...source)
  expect(mapped.item).toMatchObject({ entity: client.ref })
  expect((await run({}, OWNER, "records", "list", "waiting:true", ...source)).items).toEqual([])
  const inbox = await run({}, OWNER, "review", "list", "kind:invoice")
  expect(inbox.items).toHaveLength(1)
})
