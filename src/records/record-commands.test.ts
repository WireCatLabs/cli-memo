import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"
import { recordOf } from "./mapping.js"

const SOURCE = { provider: "example-erp", account: "demo", batch_id: "b1" }
const ACCOUNT = ["--account", "example-erp:demo"]

const upsert = (type: string, externalId: string, fields: Record<string, unknown>, relations?: unknown[]) => ({
  key: `${type}-${externalId}`,
  type,
  external_id: externalId,
  operation: "upsert",
  fields,
  ...(relations === undefined ? {} : { relations }),
})

const importing = async (f: Awaited<ReturnType<typeof businessStore>>, records: unknown[], name = "erp.json") => {
  const file = join(f.dir, name)
  writeFileSync(file, JSON.stringify({ schema_version: 1, source: SOURCE, records }))
  return f.item(OWNER, "records", "import", file, ...ACCOUNT)
}

it("reads a custom type's key up to its second colon, and any other type's at its first", () => {
  expect(recordOf("custom:quote:Q-7")).toEqual({ type: "custom:quote", externalId: "Q-7" })
  expect(recordOf("invoice:A:B")).toEqual({ type: "invoice", externalId: "A:B" })
  expect(() => recordOf("custom:quote")).toThrow(/custom:quote:Q-7/)
})

it("shows a custom record as the source sent it, and deletes a payment's record keeping its proposal flagged", async () => {
  const f = await businessStore("records-show")
  const options = [{ bikes: 12, insurance: { kind: "full" } }]
  const receipt = await importing(f, [
    upsert("custom:quote", "Q-7", { valid_until: "2026-11-30", options }),
    upsert("payment", "PAY-3", {
      direction: "in",
      amount: "100.00",
      currency: "RUB",
      date: "2026-11-05",
      payer: f.client,
    }),
  ])
  expect(receipt).toMatchObject({ created: 2, proposed: [expect.stringMatching(/^payment:/)] })

  expect(await f.item(OWNER, "records", "show", "custom:quote:Q-7", ...ACCOUNT)).toMatchObject({
    type: "custom:quote",
    external_id: "Q-7",
    fields: { valid_until: "2026-11-30", options },
    entity: null,
  })
  await expect(f.run(OWNER, "records", "show", "custom:quote:Q-8", ...ACCOUNT)).rejects.toMatchObject({
    code: "not_found",
  })

  const [proposal] = receipt.proposed as string[]
  expect(await f.item(OWNER, "records", "delete", "payment:PAY-3", ...ACCOUNT)).toMatchObject({
    deleted: 1,
    flagged: [{ entity: proposal }],
  })
  expect(await f.item(OWNER, "records", "show", "payment:PAY-3", ...ACCOUNT)).toMatchObject({
    deleted_at: expect.any(String),
    flagged: true,
  })
  expect((await f.items(OWNER, "review", "list", "kind:payment")).map((one) => one.id)).toEqual([proposal])
  expect(await f.item(OWNER, "records", "delete", "payment:PAY-3", ...ACCOUNT)).toMatchObject({ unchanged: 1 })
})

it("leaves a person whose identifiers name two people unmatched, lists it, and match names both", async () => {
  const f = await businessStore("records-match")
  const made = await importing(f, [
    upsert("person", "P-1", { name: "Анна", email: "anna@example.com" }),
    upsert("person", "P-2", { name: "Иван", phone: "+79000000002" }),
  ])
  expect(made).toMatchObject({ created: 2, unmatched: [] })
  const people = await f.items(OWNER, "records", "list", "type:person", ...ACCOUNT)
  const candidates = people.map((one) => one.entity).sort()

  const both = await importing(
    f,
    [upsert("person", "P-3", { name: "Both", email: "anna@example.com", phone: "+79000000002" })],
    "both.json",
  )
  expect(both).toMatchObject({ unmatched: [{ key: "person-P-3", reason: "record.ambiguous" }] })
  expect((await f.items(OWNER, "records", "list", "unmatched:true", ...ACCOUNT)).map((one) => one.external_id)).toEqual(
    ["P-3"],
  )

  const matched = await f.item(OWNER, "records", "match", ...ACCOUNT)
  expect(matched).toMatchObject({ linked: 0, created: 0, unmatched: [{ reason: "record.ambiguous" }] })
  expect(((matched.unmatched as { candidates: string[] }[])[0]?.candidates ?? []).sort()).toEqual(candidates)
  expect(await f.text("records", "match", ...ACCOUNT)).toMatch(/^matched 0, created 0\nunmatched person:P-3: could be /)
})

it("finds a source's records by entry, batch and deletion, and shows the records that name one", async () => {
  const f = await businessStore("records-filters")
  const receipt = await importing(f, [
    upsert("organization", "C-1", { name: "ООО Пример" }),
    upsert("product", "SKU-RENT", { kind: "service", name: "Bike rental, month" }, [
      { role: "supplier", type: "organization", external_id: "C-1" },
    ]),
    upsert("custom:quote", "Q-7", { valid_until: "2026-11-30" }, [
      { role: "quoted-for", type: "product", external_id: "SKU-RENT" },
    ]),
  ])
  expect(receipt).toMatchObject({ created: 3, errors: [] })
  const org = await f.item(OWNER, "records", "show", "organization:C-1", ...ACCOUNT)
  const byEntity = await f.items(OWNER, "records", "list", `entity:"${org.entity}"`, ...ACCOUNT)
  expect(byEntity.map((one) => one.external_id)).toEqual(["C-1"])
  expect((await f.items(OWNER, "records", "list", "batch:b1", ...ACCOUNT)).length).toBe(3)
  expect(await f.items(OWNER, "records", "list", "batch:other", ...ACCOUNT)).toEqual([])

  expect(await f.item(OWNER, "records", "show", "product:SKU-RENT", ...ACCOUNT)).toMatchObject({
    incoming: [{ record: { type: "custom:quote", external_id: "Q-7" }, role: "quoted-for", as: null, amount: null }],
  })
  expect((await f.item(OWNER, "records", "show", "organization:C-1", ...ACCOUNT)).incoming).toMatchObject([
    { record: { type: "product", external_id: "SKU-RENT" }, role: "supplier" },
  ])

  await f.item(OWNER, "records", "delete", "custom:quote:Q-7", ...ACCOUNT)
  expect((await f.items(OWNER, "records", "list", "deleted:true", ...ACCOUNT)).map((one) => one.external_id)).toEqual([
    "Q-7",
  ])
  expect((await f.items(OWNER, "records", "list", "deleted:false", ...ACCOUNT)).length).toBe(2)
  expect((await f.item(OWNER, "records", "show", "product:SKU-RENT", ...ACCOUNT)).incoming).toEqual([])
})
