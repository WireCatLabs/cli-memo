import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { openStore } from "@wirecat/cli-core/store"
import { beforeAll, describe, expect, it } from "vitest"
import { AGENT, businessStore, OWNER } from "../../test/business.js"

let f: Awaited<ReturnType<typeof businessStore>>
let person: string
let product: string
let contract: string
let wallet: string
let note: string

beforeAll(async () => {
  f = await businessStore("business-options")
  person = (await f.item(OWNER, "people", "add", "Lena", "Example")).ref as string
  product = (await f.item(OWNER, "products", "add", "Bike rental, month", "10000.00", "RUB", "--kind", "service"))
    .ref as string
  contract = (await f.item(OWNER, "contracts", "add", "Rental agreement", "--kind", "service")).ref as string
  wallet = (await f.item(OWNER, "wallets", "add", "Main account", "RUB")).ref as string
  const store = await openStore({ env: f.env })
  note = (await store.notes.addNote({ text: "# Paperwork\n\nSynthetic evidence." })).ref
  await store.close()
})

const show = (...args: string[]) => f.item(OWNER, ...args)
const confirmed = async (...args: string[]) =>
  (await f.items(OWNER, ...args)).filter((one) => one.review === "confirmed").map((one) => one.ref)
const refOf = async (...args: string[]) => (await f.item(OWNER, ...args)).ref as string

const invoice = () =>
  refOf("invoices", "add", "500.00", "RUB", "Delivery", "--kind", "receivable", "--organization", f.client)
const order = () => refOf("orders", "add", "Synthetic Rental", "1.00", "RUB", "--kind", "business")
const payment = () => refOf("payments", "add", "500.00", "RUB", "--kind", "in", "--organization", f.client)
const subscription = () =>
  refOf(
    ...["subscriptions", "add", "Hosting", "990.00", "RUB", "--kind", "payable", "--supplier", f.client],
    ...["--period", "1-month", "--start-date", "2026-01-01"],
  )
const transaction = () => refOf("transactions", "add", wallet, "500.00", "--kind", "out")

let records = 0
const sourceRecord = async () => {
  records += 1
  const file = join(f.dir, `erp-${records}.json`)
  const record = {
    key: `organization-${records}`,
    type: "organization",
    external_id: `ORG-${records}`,
    operation: "upsert",
    fields: { name: `Supplier ${records}` },
  }
  const source = { provider: "example-erp", account: "demo", batch_id: `b${records}` }
  writeFileSync(file, JSON.stringify({ schema_version: 1, source, records: [record] }))
  await f.item(OWNER, "records", "import", file, "--account", "example-erp:demo")
  return `organization:ORG-${records}`
}

interface OwnerWrite {
  command: string
  /** The owner's own records the write acts on, made afresh for each run that changes them. */
  prepare: () => Promise<string[]>
  write: (refs: string[], tag: string) => string[]
  /** What the owner sees of it: a run as the owner changes it, a run as the agent does not. */
  state: (refs: string[]) => Promise<unknown>
}

const OWNER_WRITES: OwnerWrite[] = [
  {
    command: "invoices add",
    prepare: async () => [],
    write: (_, tag) => ["invoices", "add", "100.00", "RUB", tag, "--kind", "receivable", "--organization", f.client],
    state: () => confirmed("invoices", "list"),
  },
  {
    command: "invoices lines add",
    prepare: async () => [await invoice()],
    write: ([ref], tag) => ["invoices", "lines", "add", ref as string, "1", tag, "--amount", "10.00"],
    state: ([ref]) => show("invoices", "show", ref as string),
  },
  {
    command: "invoices lines remove",
    prepare: async () => {
      const ref = await invoice()
      await f.run(OWNER, "invoices", "lines", "add", ref, "1", "Helmet", "--amount", "10.00")
      return [ref]
    },
    write: ([ref]) => ["invoices", "lines", "remove", ref as string, "2"],
    state: ([ref]) => show("invoices", "show", ref as string),
  },
  {
    command: "payments add",
    prepare: async () => [],
    write: (_, tag) => ["payments", "add", "100.00", "RUB", "--kind", "in", "--organization", f.client, "--title", tag],
    state: () => confirmed("payments", "list"),
  },
  {
    command: "payments allocate",
    prepare: async () => [await payment(), await invoice()],
    write: ([pay, bill]) => ["payments", "allocate", pay as string, bill as string, "100.00"],
    state: ([pay]) => show("payments", "show", pay as string),
  },
  {
    command: "payments unlink",
    prepare: async () => {
      const [pay, bill] = [await payment(), await invoice()]
      await f.run(OWNER, "payments", "allocate", pay, bill, "100.00")
      return [pay, bill]
    },
    write: ([pay, bill]) => ["payments", "unlink", pay as string, bill as string],
    state: ([pay]) => show("payments", "show", pay as string),
  },
  {
    command: "orders add",
    prepare: async () => [],
    write: (_, tag) => ["orders", "add", tag, "10.00", "RUB", "--kind", "business"],
    state: () => confirmed("orders", "list"),
  },
  {
    command: "orders lines add",
    prepare: async () => [await order()],
    write: ([ref], tag) => ["orders", "lines", "add", ref as string, "1", tag, "--amount", "10.00"],
    state: ([ref]) => show("orders", "show", ref as string),
  },
  {
    command: "orders lines remove",
    prepare: async () => {
      const ref = await order()
      await f.run(OWNER, "orders", "lines", "add", ref, "1", "Helmet", "--amount", "10.00")
      await f.run(OWNER, "orders", "lines", "add", ref, "1", "Bell", "--amount", "5.00")
      return [ref]
    },
    write: ([ref]) => ["orders", "lines", "remove", ref as string, "2"],
    state: ([ref]) => show("orders", "show", ref as string),
  },
  {
    command: "contracts add",
    prepare: async () => [],
    write: (_, tag) => ["contracts", "add", tag, "--kind", "service", "--amount", "1000.00", "--currency", "RUB"],
    state: () => confirmed("contracts", "list"),
  },
  {
    command: "contracts update",
    prepare: async () => [await refOf("contracts", "add", "Lease", "--kind", "lease")],
    write: ([ref], tag) => [
      "contracts",
      "update",
      ref as string,
      "--title",
      tag,
      "--amount",
      "1.00",
      "--currency",
      "RUB",
    ],
    state: ([ref]) => show("contracts", "show", ref as string),
  },
  {
    command: "subscriptions add",
    prepare: async () => [],
    write: (_, tag) => [
      ...["subscriptions", "add", tag, "990.00", "RUB", "--kind", "payable", "--supplier", f.client],
      ...["--period", "1-month", "--start-date", "2026-01-01"],
    ],
    state: () => confirmed("subscriptions", "list"),
  },
  {
    command: "subscriptions update",
    prepare: async () => [await subscription()],
    write: ([ref], tag) => ["subscriptions", "update", ref as string, "--title", tag],
    state: ([ref]) => show("subscriptions", "show", ref as string),
  },
  {
    command: "subscriptions cancel",
    prepare: async () => [await subscription()],
    write: ([ref]) => ["subscriptions", "cancel", ref as string, "--occurred-time", "2026-03-01"],
    state: ([ref]) => show("subscriptions", "show", ref as string),
  },
  {
    command: "subscriptions prices add",
    prepare: async () => [await subscription()],
    write: ([ref], tag) => [
      ...["subscriptions", "prices", "add", ref as string, "1190.00", "RUB"],
      ...["--start-date", `2026-02-${String(tag.length).padStart(2, "0")}`],
    ],
    state: async ([ref]) =>
      ((await show("subscriptions", "show", ref as string)).prices as { review: string }[]).filter(
        (one) => one.review === "confirmed",
      ),
  },
  {
    command: "wallets update",
    prepare: async () => [await refOf("wallets", "add", "Card", "RUB")],
    write: ([ref], tag) => [
      ...["wallets", "update", ref as string, "--title", tag],
      ...["--opening-balance", "10.00", "--opening-date", "2026-01-01"],
    ],
    state: ([ref]) => show("wallets", "show", ref as string),
  },
  {
    command: "transactions add",
    prepare: async () => [],
    write: (_, tag) => ["transactions", "add", wallet, "10.00", "--kind", "in", "--description", tag],
    state: () => confirmed("transactions", "list"),
  },
  {
    command: "transactions update",
    prepare: async () => [await transaction()],
    write: ([ref], tag) => ["transactions", "update", ref as string, "--description", tag],
    state: ([ref]) => show("transactions", "show", ref as string),
  },
  {
    command: "transactions splits add",
    prepare: async () => [await transaction()],
    write: ([ref], tag) => ["transactions", "splits", "add", ref as string, "100.00", tag],
    state: ([ref]) => show("transactions", "show", ref as string),
  },
  {
    command: "transactions splits remove",
    prepare: async () => {
      const ref = await transaction()
      await f.run(OWNER, "transactions", "splits", "add", ref, "100.00", "Rent")
      return [ref]
    },
    write: ([ref]) => ["transactions", "splits", "remove", ref as string, "1"],
    state: ([ref]) => show("transactions", "show", ref as string),
  },
  {
    command: "records link",
    prepare: async () => [await sourceRecord()],
    write: ([record]) => ["records", "link", record as string, f.client, "--account", "example-erp:demo"],
    state: ([record]) => show("records", "show", record as string, "--account", "example-erp:demo"),
  },
]

// The yes at a terminal that --as-owner asks for is src/decisions.test.ts's; here each write must hold to the refusal.
describe("an agent's terminal writes as the owner only after a yes to --as-owner, or with --from-app", () => {
  it.each(OWNER_WRITES)("$command", async ({ prepare, write, state }) => {
    const refs = await prepare()
    const before = await state(refs)
    await expect(f.run(AGENT, ...write(refs, "unasked"), "--as-owner")).rejects.toMatchObject({
      details: { reason: "decision.owner-unconfirmed" },
    })
    expect(await state(refs)).toEqual(before)
    await f.run(AGENT, ...write(refs, "clicked"), "--from-app")
    expect(await state(refs)).not.toEqual(before)
  })
})

describe("list --limit", () => {
  it.each(["invoices", "payments", "orders", "contracts", "subscriptions", "wallets", "transactions", "products"])(
    "%s list --limit 1 gives one of several",
    async (kind) => {
      if (kind === "products") await f.run(OWNER, "products", "add", "Helmet")
      expect((await f.items(OWNER, kind, "list")).length).toBeGreaterThan(1)
      expect(await f.items(OWNER, kind, "list", "--limit", "1")).toHaveLength(1)
    },
  )

  it("records list --limit 1 gives one of several", async () => {
    await sourceRecord()
    await sourceRecord()
    const account = ["--account", "example-erp:demo"]
    expect((await f.items(OWNER, "records", "list", ...account)).length).toBeGreaterThan(1)
    expect(await f.items(OWNER, "records", "list", ...account, "--limit", "1")).toHaveLength(1)
  })
})

describe("what each write records", () => {
  it("invoices add: the issue day, and an agent's reason and evidence", async () => {
    const proposed = await f.item(
      AGENT,
      ...["invoices", "add", "700.00", "RUB", "Repair", "--kind", "payable", "--organization", f.client],
      ...["--occurred-time", "2026-10-01", "--reason", "the supplier's mail", "--evidence", note],
    )
    expect(proposed).toMatchObject({
      review: "proposed",
      issue_date: "2026-10-01",
      reason: "the supplier's mail",
      evidence: [note],
    })
  })

  it("payments add: the person who paid and the bank's purpose line", async () => {
    const paid = await f.item(
      OWNER,
      "payments",
      "add",
      "300.00",
      "RUB",
      "--kind",
      "in",
      "--person",
      person,
      "--title",
      "INV-7",
    )
    expect(paid).toMatchObject({ payer: { ref: person }, reference: "INV-7" })
  })

  it("orders add: whom it is for, the day, the project and an agent's evidence", async () => {
    const ordered = await f.item(
      AGENT,
      ...["orders", "add", "Office Supply", "20.00", "RUB", "--kind", "client", "--person", person],
      ...["--occurred-time", "2026-10-02", "--project", "SYR", "--reason", "the shop's mail", "--evidence", note],
    )
    expect(ordered).toMatchObject({
      review: "proposed",
      customer: { ref: person },
      order_date: "2026-10-02",
      project: expect.stringMatching(/^project:/),
      evidence: [note],
    })
  })

  it("contracts add and update: status, evidence, kind, dates, renewal, notice and name", async () => {
    const draft = await f.item(
      AGENT,
      ...["contracts", "add", "Supply terms", "--kind", "purchase", "--status", "draft"],
      ...["--amount", "50.00", "--currency", "RUB", "--reason", "the draft", "--evidence", note],
    )
    expect(draft).toMatchObject({ status: "draft", review: "proposed", evidence: [note] })
    const changed = await f.item(
      OWNER,
      ...["contracts", "update", contract, "--kind", "lease", "--start-date", "2026-01-01", "--end-date", "2026-12-31"],
      ...["--auto-renew", "on", "--notice-days", "30", "--title", "Bike lease"],
    )
    expect(changed).toMatchObject({
      kind: "lease",
      effective_date: "2026-01-01",
      auto_renew: true,
      notice_deadline: "2026-12-01",
      name: "Bike lease",
    })
  })

  it("subscriptions add and update: product, contract, project, parties, dates and name", async () => {
    const proposed = await f.item(
      AGENT,
      ...["subscriptions", "add", "Bike rental", "10000.00", "RUB", "--kind", "receivable", "--customer", f.client],
      ...["--period", "1-month", "--start-date", "2026-11-01", "--product", product, "--contract", contract],
      ...["--project", "SYR", "--reason", "the signed order", "--evidence", note],
    )
    expect(proposed).toMatchObject({
      review: "proposed",
      product,
      contract,
      project: expect.stringMatching(/^project:/),
      reason: "the signed order",
      evidence: [note],
    })
    const ref = await subscription()
    const changed = await f.item(
      OWNER,
      ...["subscriptions", "update", ref, "--supplier", person, "--customer", f.client, "--product", product],
      ...["--contract", contract, "--start-date", "2026-02-01", "--status", "trial", "--trial-end-date", "2026-02-14"],
      ...["--end-date", "2026-12-31", "--title", "Hosting, yearly"],
    )
    expect(changed).toMatchObject({
      supplier: { ref: person },
      customer: { ref: f.client },
      product,
      contract,
      start_date: "2026-02-01",
      trial_end_date: "2026-02-14",
      end_date: "2026-12-31",
      name: "Hosting, yearly",
    })
  })

  it("products add and update: description, name and unit", async () => {
    const helmet = await f.item(OWNER, "products", "add", "Helmet", "--description", "A size M helmet")
    expect(helmet).toMatchObject({ description: "A size M helmet" })
    const changed = await f.item(
      OWNER,
      ...["products", "update", helmet.ref as string, "--title", "Helmet M", "--unit", "piece"],
      ...["--description", "A size M helmet, white"],
    )
    expect(changed).toMatchObject({ name: "Helmet M", unit: "piece", description: "A size M helmet, white" })
  })

  it("wallets update: name and bank", async () => {
    const ref = await refOf("wallets", "add", "Savings", "RUB")
    expect(
      await f.item(OWNER, "wallets", "update", ref, "--title", "Rainy day", "--institution", "Bank Two"),
    ).toMatchObject({ name: "Rainy day", institution: "Bank Two" })
  })

  it("transactions add and update: project, an agent's evidence, and the statement's words", async () => {
    const proposed = await f.item(
      AGENT,
      ...["transactions", "add", wallet, "40.00", "--kind", "out", "--project", "SYR"],
      ...["--reason", "statement", "--evidence", note],
    )
    expect(proposed).toMatchObject({
      review: "proposed",
      project: expect.stringMatching(/^project:/),
      evidence: [note],
    })
    const ref = await transaction()
    expect(await f.item(OWNER, "transactions", "update", ref, "--description", "Coffee beans")).toMatchObject({
      description: "Coffee beans",
    })
  })
})

describe("the rest of each command's options", () => {
  it("invoices add --person and payments add --occurred-time", async () => {
    expect(
      await f.item(OWNER, "invoices", "add", "80.00", "RUB", "Lesson", "--kind", "receivable", "--person", person),
    ).toMatchObject({ counterparty: { ref: person } })
    expect(
      await f.item(OWNER, "payments", "add", "80.00", "RUB", "--kind", "in", "--occurred-time", "2026-10-05"),
    ).toMatchObject({ date: "2026-10-05" })
  })

  it("pipelines add --kind, deals add --person --role --due, pipelines show --since-time, leads", async () => {
    expect(
      await f.item(OWNER, "pipelines", "add", "Inbound", "New", "Qualified", "won", "lost", "--kind", "lead"),
    ).toMatchObject({ kind: "lead" })
    await f.item(OWNER, "pipelines", "add", "Sales", "Call", "Quote", "won", "lost")
    expect(
      await f.item(
        OWNER,
        ...["deals", "add", "Fleet", "Sales/Call", "--person", person, "--role", "decision-maker"],
        ...["--due", "2026-12-01"],
      ),
    ).toMatchObject({ close_date: "2026-12-01", people: [{ ref: person, role: "decision-maker" }] })
    expect(await f.item(OWNER, "pipelines", "show", "Sales", "--since-time", "2026-01-01")).toMatchObject({
      totals: { items: 1 },
    })
    expect(await f.item(OWNER, "pipelines", "show", "Sales", "--since-time", "2099-01-01")).toMatchObject({
      since: "2099-01-01",
      totals: { items: 0 },
    })

    const lead = (await f.item(OWNER, "leads", "add", "Website form", "Inbound/New")).ref as string
    const brief = await f.item(OWNER, "leads", "context", lead, "--brief")
    expect(brief).toMatchObject({ ref: lead, stages: ["∅ → New"] })
    expect(await f.item(OWNER, "leads", "context", lead)).not.toEqual(brief)
    expect(await f.item(OWNER, "leads", "close", lead, "lost", "--reason", "went elsewhere")).toMatchObject({
      status: "lost",
      closed_reason: "went elsewhere",
    })

    expect(await f.item(OWNER, "stages", "confirm", "--pipeline", "Sales")).toEqual({ confirmed: 0 })
    await expect(f.item(OWNER, "stages", "confirm", "--pipeline", "Nowhere")).rejects.toMatchObject({
      code: "not_found",
    })
  })

  it("subscriptions update --period and transactions add --payment", async () => {
    const ref = await subscription()
    expect(await f.item(OWNER, "subscriptions", "update", ref, "--period", "1-year")).toMatchObject({
      interval: { count: 1, unit: "year" },
    })
    const paid = await payment()
    expect(
      await f.item(OWNER, "transactions", "add", wallet, "500.00", "--kind", "in", "--payment", paid),
    ).toMatchObject({ payment: paid })
  })

  it("records import --dry-run plans the import and writes nothing", async () => {
    const file = join(f.dir, "erp-dry.json")
    const record = {
      key: "organization-dry",
      type: "organization",
      external_id: "ORG-DRY",
      operation: "upsert",
      fields: { name: "Supplier Dry" },
    }
    const source = { provider: "example-erp", account: "demo", batch_id: "dry" }
    writeFileSync(file, JSON.stringify({ schema_version: 1, source, records: [record] }))
    const planned = await f.item(OWNER, "records", "import", file, "--account", "example-erp:demo", "--dry-run")
    expect(planned).toMatchObject({ dry_run: true, created: 1 })
    const organizations = await f.items(OWNER, "organizations", "list")
    expect(organizations.map((one) => one.name)).not.toContain("Supplier Dry")
  })
})
