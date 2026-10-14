import { captureStreams } from "@wirecat/cli-base"
import { Command } from "commander"
import { describe, expect, it } from "vitest"
import { jsonFields } from "./json-fields.js"

const programWith = (answer: unknown) => {
  const raw = captureStreams()
  const fields = jsonFields(raw)
  const program = new Command("memo").exitOverride()
  program
    .command("show")
    .option("--json")
    .action(() => fields.streams.data(JSON.stringify(answer)))
  fields.install(program, false)
  return { program, raw }
}

const run = async (answer: unknown, args: string[]) => {
  const { program, raw } = programWith(answer)
  await program.parseAsync(args, { from: "user" })
  return JSON.parse(raw.stdout.join(""))
}

describe("--json [fields]", () => {
  it("keeps only the named fields of each item and leaves page and meta alone", async () => {
    const list = { items: [{ id: "1", title: "a", body: "x" }], page: { has_more: false }, meta: { complete: true } }
    expect(await run(list, ["show", "--json=id,title"])).toEqual({
      items: [{ id: "1", title: "a" }],
      page: { has_more: false },
      meta: { complete: true },
    })
  })

  it("keeps the named fields of a single item, and of an answer that has no envelope", async () => {
    expect(await run({ item: { id: "1", body: "x" }, meta: {} }, ["show", "--json=id"])).toEqual({
      item: { id: "1" },
      meta: {},
    })
    expect(await run({ every: "5m", timer: "active" }, ["show", "--json=every"])).toEqual({ every: "5m" })
  })

  it("prints everything with a bare --json", async () => {
    expect(await run({ item: { id: "1", body: "x" } }, ["show", "--json"])).toEqual({ item: { id: "1", body: "x" } })
  })
})
