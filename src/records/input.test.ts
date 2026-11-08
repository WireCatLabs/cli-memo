import { writeFileSync } from "node:fs"
import { join } from "node:path"
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
  expect(receipt.vcard).toEqual([{ card: 2, message: expect.stringContaining("no country code") }])
  const people = await f.items(OWNER, "records", "list", "type:person", "--account", "phone:pixel")
  expect(people.map((one) => (one.fields as { name: string }).name).sort()).toEqual(["Анна Образцова", "Иван"])

  await expect(f.piped(book, "records", "import", "-", "--account", "sheet:pixel")).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("refuses a JSONL file whose header names another account, and still reads the next file", async () => {
  const f = await businessStore("records-header")
  const lines = `${JSON.stringify(header)}\n${JSON.stringify(payment(1, f.client))}\n`
  const refused = await f.piped(lines, "records", "check", "-", "--account", "sheet:someone-else")
  expect(refused.errors).toEqual([expect.objectContaining({ code: "envelope.account-mismatch" })])
  expect(await f.piped(lines, "records", "check", "-", "--account", "sheet:synthetic-rental")).toMatchObject({
    created: 1,
  })
})

it("answers a valid envelope for an empty file, a JSON array and a refusal with no pointer", async () => {
  const f = await businessStore("records-roots")
  const file = (name: string, text: string) => {
    const path = join(f.dir, name)
    writeFileSync(path, text)
    return path
  }
  const account = ["--account", "sheet:synthetic-rental"]
  for (const text of ["", "[1,2]"]) {
    const answer = await f.run(OWNER, "records", "check", file("root.json", text), ...account)
    expect(answer.item.errors).toEqual([expect.objectContaining({ pointer: "", code: "envelope.invalid" })])
    expect(answer.meta.issues).toEqual([{ code: "validation_error", source: "/", reason: "envelope.invalid" }])
    process.exitCode = 0
  }
  const org = { key: "o", type: "organization", external_id: "O1", operation: "upsert", fields: { name: "ООО Пример" } }
  const nameless = {
    key: "s",
    type: "subscription",
    external_id: "S1",
    operation: "upsert",
    fields: { direction: "payable", interval: "1-month", start_date: "2026-11-01" },
    relations: [{ role: "supplier", type: "organization", external_id: "O1" }],
  }
  const sheet = file("s.json", JSON.stringify({ ...header, records: [nameless, org] }))
  const answer = await f.run(OWNER, "records", "import", sheet, ...account)
  expect(answer.item.errors).toEqual([expect.objectContaining({ pointer: "", code: "subscription.field" })])
  expect(answer.meta.issues).toEqual([{ code: "validation_error", source: "/", reason: "subscription.field" }])
  process.exitCode = 0
})

it("prints every refusal on stderr as it happens, past the receipt's 1000, and keeps stdout to the receipt", async () => {
  const f = await businessStore("records-issues")
  const broken = Array.from({ length: 1001 }, (_, at) => JSON.stringify({ key: `k${at}`, type: "payment" }))
  const lines = `${JSON.stringify(header)}\n${broken.join("\n")}\n`
  const { stdout, stderr } = await f.streamsOf(
    lines,
    "records",
    "check",
    "-",
    "--account",
    "sheet:synthetic-rental",
    "--json",
  )
  process.exitCode = 0
  expect(
    stderr
      .trimEnd()
      .split("\n")
      .filter((line) => line.startsWith("refused ")),
  ).toHaveLength(1001)
  const receipt = JSON.parse(stdout).item
  expect(receipt).toMatchObject({ refused: 1001, truncated: true })
  expect(receipt.errors).toHaveLength(1000)
})

it("names a missing records file and a folder given as one, instead of a system error", async () => {
  const f = await businessStore("records-files")
  const account = ["--account", "sheet:synthetic-rental"]
  await expect(f.run(OWNER, "records", "check", join(f.dir, "nope.jsonl"), ...account)).rejects.toMatchObject({
    code: "not_found",
    details: { reason: "records.file-missing" },
  })
  await expect(f.run(OWNER, "records", "check", f.dir, ...account)).rejects.toMatchObject({
    code: "validation_error",
    details: { reason: "records.file-unreadable" },
  })
})

it("reads a vCard's national numbers in --region, in any case, so they match the person a number already names", async () => {
  const f = await businessStore("records-vcard-region")
  const card = (tel: string) => ["BEGIN:VCARD", "VERSION:3.0", "FN:Иван", `TEL:${tel}`, "END:VCARD", ""].join("\r\n")
  await f.piped(card("+79000000002"), "records", "import", "-", "--account", "phone:pixel")
  const [known] = await f.items(OWNER, "records", "list", "type:person", "--account", "phone:pixel")

  const national = card("8 900 000-00-02")
  const checked = await f.piped(national, "records", "check", "-", "--account", "phone:tablet", "--region", "RU")
  expect(checked).toMatchObject({ dry_run: true, errors: [] })
  expect(checked.vcard).toEqual([])
  const imported = await f.piped(national, "records", "import", "-", "--account", "phone:tablet", "--region", "RU")
  expect(imported).toMatchObject({ errors: [], vcard: [] })
  const [matched] = await f.items(OWNER, "records", "list", "type:person", "--account", "phone:tablet")
  expect(matched?.entity).toBe(known?.entity)

  const unread = await f.piped(national, "records", "import", "-", "--account", "phone:laptop")
  expect(unread.vcard).toEqual([{ card: 1, message: expect.stringContaining("no country code") }])
  const [apart] = await f.items(OWNER, "records", "list", "type:person", "--account", "phone:laptop")
  expect(apart?.entity).not.toBe(known?.entity)
})

it("refuses --region for an envelope and a country memo has no phone plan for", async () => {
  const f = await businessStore("records-region-refused")
  const envelope = `${JSON.stringify(header)}\n${JSON.stringify(payment(1, f.client))}\n`
  await expect(
    f.piped(envelope, "records", "import", "-", "--account", "sheet:synthetic-rental", "--region", "ru"),
  ).rejects.toMatchObject({ code: "validation_error" })
  const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Иван", "TEL:8 900 000-00-02", "END:VCARD", ""].join("\r\n")
  await expect(
    f.piped(card, "records", "import", "-", "--account", "phone:pixel", "--region", "zz"),
  ).rejects.toMatchObject({ code: "validation_error", message: expect.stringMatching(/^--region is one of .*\bru\b/) })
})
