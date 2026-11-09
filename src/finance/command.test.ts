import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"

import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"

const AGENT = { AI_AGENT: "claude-code_2-1-296_agent" }
const OWNER = {}
const AT_TERMINAL: Terminal = { present: true }
const NOBODY: Terminal = { present: false }

const setUp = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-finance-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.knowledge.addProject({ name: "Synthetic Rental", key: "SYR" })
  const client = await store.knowledge.addOrganization({ name: "ООО Пример", kind: "company" })
  const note = await store.notes.addNote({ text: "# Payment\n\nПример paid 1000 RUB." })
  await store.close()
  const run = async (who: Record<string, string>, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...who }, terminal: who === OWNER ? AT_TERMINAL : NOBODY })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  const text = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: AT_TERMINAL }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const item = async (who: Record<string, string>, ...args: string[]) =>
    (await run(who, ...args)).item as Record<string, unknown>
  return { run, item, text, client: client.ref, note: note.ref }
}

it("confirms the owner's payment at once and keeps an agent's as a proposal for review", async () => {
  const f = await setUp()
  const own = await f.item(OWNER, "payments", "add", "25000.00", "RUB", "--kind", "in", "--organization", f.client)
  expect(own).toMatchObject({ review: "confirmed", amount: "25000.00", payer: { ref: f.client } })

  const proposed = await f.item(
    AGENT,
    ...[
      "payments",
      "add",
      "1000.00",
      "RUB",
      "--kind",
      "in",
      "--organization",
      f.client,
      "--reason",
      "msg says paid",
      "--evidence",
      f.note,
    ],
  )
  expect(proposed).toMatchObject({ review: "proposed", reason: "msg says paid", evidence: [f.note] })

  const waiting = await f.run(OWNER, "review", "list", "kind:payment")
  expect((waiting.items as { id: string }[]).map((one) => one.id)).toEqual([proposed.ref])
  const refused = await f.run(AGENT, "review", "confirm", proposed.ref as string, "--reason", "looks right")
  expect(refused.item).toMatchObject({ decided: [], refused: [{ id: proposed.ref }] })
  process.exitCode = 0

  await f.run(OWNER, "review", "confirm", proposed.ref as string)
  expect(await f.item(OWNER, "payments", "show", proposed.ref as string)).toMatchObject({ review: "confirmed" })
})

it("refuses an allocation beyond the payment and totals the project's confirmed books per currency", async () => {
  const f = await setUp()
  const invoice = await f.item(
    OWNER,
    ...["invoices", "add", "50000.00", "RUB", "Аренда", "кровати", "--kind", "receivable"],
    ...["--organization", f.client, "--project", "SYR", "--due", "2026-11-15", "--title", "FACT-2026-00012"],
  )
  expect(invoice).toMatchObject({ review: "confirmed", status: "issued", total: "50000.00" })
  const payment = await f.item(
    OWNER,
    ...["payments", "add", "30000.00", "RUB", "--kind", "in", "--organization", f.client, "--project", "SYR"],
  )
  await expect(
    f.run(OWNER, "payments", "allocate", payment.ref as string, invoice.ref as string, "30000.01"),
  ).rejects.toMatchObject({ code: "validation_error" })
  await f.run(OWNER, "payments", "allocate", payment.ref as string, invoice.ref as string, "30000.00")
  await f.item(
    OWNER,
    "invoices",
    "add",
    "100",
    "EUR",
    "Hosting",
    "--kind",
    "payable",
    "--organization",
    f.client,
    "--project",
    "SYR",
  )
  await f.item(
    AGENT,
    "invoices",
    "add",
    "999.00",
    "RUB",
    "Guess",
    "--kind",
    "receivable",
    "--organization",
    f.client,
    "--project",
    "SYR",
  )

  const numbered = await f.run(OWNER, "invoices", "list", "number:FACT-2026-00012")
  expect((numbered.items as { ref: string }[]).map((one) => one.ref)).toEqual([invoice.ref])

  const status = await f.item(OWNER, "projects", "status", "SYR")
  expect(status.finance).toEqual([
    {
      direction: "payable",
      currency: "EUR",
      billed: "100.00",
      paid: "0.00",
      owed: "100.00",
      unallocated: "0.00",
      invoices: [expect.stringMatching(/^invoice:/)],
      payments: [],
    },
    {
      direction: "receivable",
      currency: "RUB",
      billed: "50000.00",
      paid: "30000.00",
      owed: "20000.00",
      unallocated: "0.00",
      invoices: [invoice.ref],
      payments: [payment.ref],
    },
  ])
  expect(await f.text("projects", "status", "SYR", "--compact")).toMatch(
    /receivable · RUB · 50000\.00 · 30000\.00 · 20000\.00/,
  )
})

it("takes back a proposed payment's allocation so the owner allocates it again", async () => {
  const f = await setUp()
  const invoice = await f.item(
    OWNER,
    ...["invoices", "add", "75000.00", "RUB", "SEO", "--kind", "receivable", "--organization", f.client],
  )
  const payment = await f.item(
    AGENT,
    ...["payments", "add", "15000.00", "RUB", "--kind", "in", "--organization", f.client, "--reason", "the sheet"],
  )
  await f.run(AGENT, "payments", "allocate", payment.ref as string, invoice.ref as string, "15000.00")

  const back = await f.item(OWNER, "payments", "unlink", payment.ref as string, invoice.ref as string)
  expect(back).toMatchObject({ review: "proposed", allocated: "0.00", allocations: [] })
  await f.run(OWNER, "payments", "allocate", payment.ref as string, invoice.ref as string, "13000.00")
  expect(await f.item(OWNER, "payments", "show", payment.ref as string)).toMatchObject({ allocated: "13000.00" })
})

it("lets only you move money between the invoices of a confirmed payment", async () => {
  const f = await setUp()
  const add = (amount: string) =>
    f.item(OWNER, ...["invoices", "add", amount, "RUB", "SEO", "--kind", "receivable", "--organization", f.client])
  const [seo, support] = [await add("23000.00"), await add("12000.00")]
  const payment = await f.item(
    OWNER,
    ...["payments", "add", "35000.00", "RUB", "--kind", "in", "--organization", f.client],
  )
  const [pay, seoRef, supportRef] = [payment.ref as string, seo.ref as string, support.ref as string]
  await f.run(OWNER, "payments", "allocate", pay, seoRef, "23000.00")
  await f.run(OWNER, "payments", "allocate", pay, supportRef, "10000.00")

  await expect(f.run(AGENT, "payments", "unlink", pay, seoRef)).rejects.toMatchObject({
    code: "permission_error",
  })
  await f.run(OWNER, "payments", "unlink", pay, seoRef)
  await f.run(OWNER, "payments", "allocate", pay, seoRef, "21000.00")
  await f.run(OWNER, "payments", "allocate", pay, supportRef, "2000.00")
  expect(await f.item(OWNER, "invoices", "show", supportRef)).toMatchObject({ status: "paid", paid: "12000.00" })
  expect(await f.item(OWNER, "payments", "show", pay)).toMatchObject({ review: "confirmed", allocated: "33000.00" })
  await expect(f.run(OWNER, "payments", "allocate", pay, supportRef, "0.01")).rejects.toMatchObject({
    details: { reason: "finance.over-invoice" },
  })
})

it("records a refund of a confirmed payment going the other way, and refuses one larger than the payment", async () => {
  const f = await setUp()
  const paid = await f.item(OWNER, "payments", "add", "1000.00", "RUB", "--kind", "in", "--organization", f.client)
  const refund = await f.item(
    OWNER,
    ...[
      "payments",
      "add",
      "400.00",
      "RUB",
      "--kind",
      "out",
      "--organization",
      f.client,
      "--refund-of",
      paid.ref as string,
    ],
  )
  expect(refund).toMatchObject({ review: "confirmed", direction: "out", refund_of: paid.ref })
  await expect(
    f.run(OWNER, "payments", "add", "700.00", "RUB", "--kind", "out", "--refund-of", paid.ref as string),
  ).rejects.toMatchObject({ code: "validation_error" })
})
