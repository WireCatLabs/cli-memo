import { expect, it } from "vitest"
import { businessStore, OWNER } from "../../test/business.js"

const header = { schema_version: 1, source: { provider: "sheet", account: "synthetic-rental", batch_id: "b1" } }

const payment = (index: number, payer: string) => ({
  key: `p-${index}`,
  type: "payment",
  external_id: `платёж-${index}`,
  operation: "upsert",
  fields: { direction: "in", currency: "RUB", date: "2026-11-01", amount: `${index}000.00`, payer },
})

it("streams JSONL from stdin: a dry run first, then the import, every payment a proposal", async () => {
  const f = await businessStore("records-stdin")
  const lines = `\n${[header, payment(1, f.client), payment(2, f.client), payment(3, f.client)].map((one) => JSON.stringify(one)).join("\n")}\n`
  const account = ["--account", "sheet:synthetic-rental"]

  expect(await f.piped(lines, "records", "check", "-", ...account)).toMatchObject({ dry_run: true, created: 3 })
  expect(await f.items(OWNER, "payments", "list")).toEqual([])
  const imported = await f.piped(lines, "records", "import", "-", ...account)
  expect(imported).toMatchObject({ dry_run: false, created: 3, truncated: false, unmatched: [], errors: [] })
  expect(imported.proposed).toHaveLength(3)
  expect(await f.piped(lines, "records", "import", "-", ...account)).toMatchObject({ unchanged: 3, proposed: [] })
})

it("takes a vCard address book as the phone's contacts under phone:<device>, and reports what it kept unmatched", async () => {
  const f = await businessStore("records-vcard")
  const book = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Анна Образцова",
    "EMAIL:anna@example.com",
    "TEL;TYPE=CELL:+79000000001",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Иван",
    "TEL:8 900 000-00-02",
    "END:VCARD",
    "",
  ].join("\r\n")

  const receipt = await f.piped(book, "records", "import", "-", "--account", "phone:pixel")
  expect(receipt).toMatchObject({ source: { provider: "phone", account: "pixel" }, created: 2, errors: [] })
  expect(receipt.vcard).toEqual([{ card: 1, message: expect.stringContaining("no country code") }])
  const people = await f.items(OWNER, "records", "list", "type:person", "--account", "phone:pixel")
  expect(people.map((one) => (one.fields as { name: string }).name).sort()).toEqual(["Анна Образцова", "Иван"])

  await expect(f.piped(book, "records", "import", "-", "--account", "sheet:pixel")).rejects.toMatchObject({
    code: "validation_error",
  })
})
