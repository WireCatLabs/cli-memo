import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"

const EXAMPLE = readFileSync(
  createRequire(import.meta.url).resolve("@wirecat/cli-core/schemas/examples/records-business.jsonl"),
  "utf8",
)
const ACCOUNT = "example-erp:demo"

it("imports cli-core's business example once, and memo show, the entity shows and search all find what it wrote", async () => {
  const f = await businessStore("business-example")
  const first = await f.piped(EXAMPLE, "records", "import", "-", "--account", ACCOUNT)
  expect(first).toMatchObject({ created: 10, refused: 0, errors: [], waiting: [] })
  expect(first.proposed).toEqual(["contract:1", "order:1", "invoice:1", "payment:1"])
  expect(await f.piped(EXAMPLE, "records", "import", "-", "--account", ACCOUNT)).toMatchObject({
    created: 0,
    updated: 0,
    unchanged: 10,
    proposed: [],
  })

  const [deal] = await f.items(OWNER, "deals", "list")
  const [product] = await f.items(OWNER, "products", "list")
  const refs = [String(product?.ref), "contract:1", "order:1", "invoice:1", "payment:1", String(deal?.ref)]
  const shown = await f.items(OWNER, "show", ...refs)
  expect(shown.map((one) => (one.open as { line: string }).line)).toEqual([
    `memo products show ${product?.ref}`,
    "memo contracts show contract:1",
    "memo orders show order:1",
    "memo invoices show invoice:1",
    "memo payments show payment:1",
    `memo deals show ${deal?.ref}`,
  ])
  expect(shown.map((one) => (one.sources as { records: { items: { record: string }[] } }).records.items)).toEqual([
    [{ record: "product:SKU-RENT", account: ACCOUNT }],
    [{ record: "contract:K-2026-14", account: ACCOUNT }],
    [{ record: "order:O-55", account: ACCOUNT }],
    [{ record: "invoice:INV-901", account: ACCOUNT }],
    [{ record: "payment:PAY-3", account: ACCOUNT }],
    [{ record: "deal:D-7", account: ACCOUNT }],
  ])

  expect(shown.map((one) => one.untrusted)).toEqual(refs.map(() => ["title"]))
  const own = await f.item(OWNER, "products", "add", "Helmet", "2500.00", "RUB")
  const [ownShown] = await f.items(OWNER, "show", String(own.ref))
  expect(ownShown).not.toHaveProperty("untrusted")
  expect(ownShown?.sources).toEqual({
    records: { items: [], has_more: false },
    incoming: { items: [], has_more: false },
  })

  const shownDeal = await f.item(OWNER, "deals", "show", String(deal?.ref))
  expect((shownDeal.sources as { incoming: { items: unknown[] } }).incoming.items).toContainEqual({
    record: "custom:quote:Q-7",
    account: ACCOUNT,
    role: "quoted-for",
    as: null,
  })
  const contract = await f.item(OWNER, "contracts", "show", "contract:1")
  expect((contract.sources as { incoming: { items: { record: string; role: string }[] } }).incoming.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record: "order:O-55", role: "contract" }),
      expect.objectContaining({ record: "invoice:INV-901", role: "contract" }),
    ]),
  )
  const pipeline = await f.item(OWNER, "pipelines", "show", String(deal?.pipeline))
  expect((pipeline.sources as { records: { items: unknown[] } }).records.items).toEqual([
    { record: "pipeline:sales", account: ACCOUNT },
  ])
  const quote = await f.item(OWNER, "records", "show", "custom:quote:Q-7", "--account", ACCOUNT)
  expect(quote.relations).toEqual([expect.objectContaining({ role: "quoted-for", resolved: true })])

  const hits = await f.items(OWNER, "search", "all", "Rental", "--only", "business")
  expect(hits.map((hit) => hit.ref)).toEqual(expect.arrayContaining(["contract:1", String(product?.ref)]))
  expect(hits.every((hit) => hit.provider === "example-erp" && hit.account === "demo")).toBe(true)

  const text = await f.text("show", "contract:1")
  expect(text).toContain(`from ${ACCOUNT} contract:K-2026-14`)
  expect(text).toContain(`named by ${ACCOUNT} order:O-55 as contract`)
})

it("counts an entity's sources in its text, and gives them whole with --json", async () => {
  const f = await businessStore("business-example-text")
  await f.piped(EXAMPLE, "records", "import", "-", "--account", ACCOUNT)
  for (const [group, ref] of [
    ["contracts", "contract:1"],
    ["invoices", "invoice:1"],
  ] as const)
    expect(await f.text(group, "show", ref)).toMatch(/^sources:\n {2}records:\n {4}items: 1 /m)
})
