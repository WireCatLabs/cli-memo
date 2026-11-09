import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-records-sheet-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const call = async (args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: { present: true } })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const item = async (...args: string[]) => envelopeOf(await call([...args, "--json"])).item as Record<string, unknown>
  const sheet = (name: string, text: string) => {
    const file = join(dir, name)
    writeFileSync(file, text)
    return file
  }
  return { call, item, sheet }
}

it("lists every type with its columns, and writes a CSV header in Excel's separator", async () => {
  const f = setUp()
  const { types } = (await f.item("records", "templates", "list")) as {
    types: { type: string; columns: { name: string }[] }[]
  }
  expect(types.map((t) => t.type)).toEqual(expect.arrayContaining(["organization", "invoice", "transaction"]))
  expect(types.map((t) => t.type)).not.toContain("message")
  const json = await f.item("records", "templates", "show", "invoice", "--format", "json", "--account", "sheet:rentals")
  expect(JSON.parse(json.text as string).source).toMatchObject({ provider: "sheet", account: "rentals" })
  expect(await f.call(["records", "templates", "show", "organization", "--locale", "ru"])).toMatch(/^﻿external_id;name;/)
})

it("imports a sheet Russian Excel saved, and a second import changes nothing", async () => {
  const f = setUp()
  const file = f.sheet(
    "payments.csv",
    "﻿external_id;direction;currency;date;amount\r\nP-1;in;rub;01.11.2026;50 000,00\r\n",
  )
  const args = ["records", "import", file, "--type", "payment", "--account", "sheet:rentals"]
  expect(await f.item(...args)).toMatchObject({ created: 1, errors: [] })
  expect(await f.item(...args)).toMatchObject({ created: 0, unchanged: 1 })
})

it("names the sheet's line and column of each refusal", async () => {
  const f = setUp()
  const file = f.sheet("p.csv", "external_id,direction,currency,date,amount\nP-1,in,RUB,2026-11-01,lots\n")
  const receipt = await f.item("records", "check", file, "--type", "payment", "--account", "sheet:rentals")
  expect(receipt.errors).toEqual([expect.objectContaining({ place: { line: 2, column: "amount" } })])
  const bad = f.sheet("bad.csv", "external_id,amt\nP-1,5\n")
  expect(await f.item("records", "import", bad, "--type", "payment", "--account", "sheet:r")).toMatchObject({
    dry_run: false,
    created: 0,
    refused: 1,
    errors: [expect.objectContaining({ code: "envelope.invalid", place: { line: 1, column: "amt" } })],
  })
  await expect(f.call(["records", "check", file, "--account", "sheet:rentals"])).rejects.toThrow(/--type/)
})
