import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const DAY = 86_400_000

const setUp = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-documents-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(dir, "s.db"), MEMO_CONFIG_DIR: dir }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ path: join(dir, "s.db") })
  let folder: string
  try {
    folder = (await store.notes.addFolder({ name: "Synthetic notes" })).id
    await store.notes.saveFileNote({
      folderId: folder,
      path: "Projects/brief.md",
      title: "Brief",
      text: "an invented budget",
    })
    await store.notes.saveFileNote({ folderId: folder, path: "todo.txt", title: "Todo", text: "nothing to do" })
  } finally {
    await store.close()
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: { present: true } })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { dir, env, run, folder, json: async (...args: string[]) => envelopeOf(await run(...args, "--json")) }
}

it("lists the documents of every account, narrows them, shows one and gives the folder tree", async () => {
  const f = await setUp()
  const notes = join(f.dir, "notes")
  mkdirSync(notes)
  await f.run("folders", "update", f.folder, notes)
  const all = (await f.json("documents", "list")) as {
    items: { ref: string; kind: string; folder: string | null; local_path: string | null; source: { source: string } }[]
    page: { total?: { value: number }; has_more: boolean }
    meta: { accounts: string[] }
  }
  expect(all.items.map(({ kind, folder }) => `${kind}:${folder}`).sort()).toEqual(["md:Projects", "txt:null"])
  expect(all.meta.accounts).toEqual([all.items[0]?.source.source])
  expect(all.page).toMatchObject({ total: { value: 2, relation: "eq" }, has_more: false })
  expect(all.items.map(({ local_path }) => local_path).sort()).toEqual([
    join(notes, "Projects/brief.md"),
    join(notes, "todo.txt"),
  ])
  const found = (await f.json("documents", "list", "budget", "--limit", "1")) as { items: { ref: string }[] }
  expect(found.items).toHaveLength(1)
  const shown = (await f.json("documents", "show", found.items[0]?.ref as string, "--max-chars", "9")) as {
    item: { text: string; has_more: boolean }
  }
  expect(shown.item).toMatchObject({ text: "an invent", has_more: true })
  const sources = (await f.json("documents", "tree")) as { items: { count: number; folders: unknown[] }[] }
  expect(sources.items).toEqual([
    expect.objectContaining({ count: 2, loose: 1, folders: [expect.objectContaining({ path: "Projects", count: 1 })] }),
  ])
  expect(await f.run("documents", "list", "kind:pdf")).not.toContain("brief")
  const second = (await f.json("documents", "list", "--limit", "1", "--page", "2")) as { items: { ref: string }[] }
  expect(second.items.map(({ ref }) => ref)).toEqual([all.items[1]?.ref])
  const rest = (await f.json("documents", "show", found.items[0]?.ref as string, "--cursor", "3")) as {
    item: { text: string }
  }
  expect(rest.item.text).toBe("invented budget")
  const account = all.items[0]?.source.source as string
  const shallow = (await f.json("documents", "tree", "--source", account, "--depth", "0")) as {
    items: { folders: unknown[] }[]
  }
  expect(shallow.items).toEqual([expect.objectContaining({ folders: [] })])
})

it("lists a phone call and a calendar-free meeting window as rows, oldest first on asking", async () => {
  const f = await setUp()
  const header = { schema_version: 1, source: { provider: "phone", account: "pixel", batch_id: "b1" } }
  const call = (id: string, days: number) => ({
    key: id,
    type: "event",
    external_id: id,
    operation: "upsert",
    fields: {
      kind: "call",
      direction: "in",
      phone: "+34600000001",
      name: "Synthetic Caller",
      started_at: new Date(Date.now() - days * DAY).toISOString(),
      duration: 65,
    },
  })
  const file = join(f.dir, "calls.jsonl")
  writeFileSync(file, [header, call("c1", 2), call("c2", 4)].map((line) => JSON.stringify(line)).join("\n"))
  await f.run("records", "import", file, "--account", "phone:pixel", "--json")
  const listed = (await f.json("meetings", "list")) as {
    items: { ref: string; kind: string; started_at: string }[]
    meta: { accounts: string[] }
  }
  expect(listed.items.map(({ kind }) => kind)).toEqual(["call", "call"])
  expect(listed.meta.accounts).toEqual(["phone:pixel"])
  const from = new Date(Date.now() - 5 * DAY).toISOString()
  const oldest = (await f.json("meetings", "list", `started_at:[${from} TO *]`, "--order", "start")) as {
    items: { started_at: string }[]
  }
  expect(oldest.items.map(({ started_at }) => started_at)).toEqual(
    listed.items.map(({ started_at }) => started_at).reverse(),
  )
  const shown = (await f.json("meetings", "show", listed.items[0]?.ref as string, "--cursor", "0", "--limit", "5")) as {
    item: { kind: string; transcript: unknown }
  }
  expect(shown.item).toMatchObject({ kind: "call", transcript: null })
  const paged = (await f.json("meetings", "list", "--limit", "1", "--page", "2")) as {
    items: { ref: string }[]
    page: { has_more: boolean; total: { value: number } }
  }
  expect(paged).toMatchObject({
    items: [{ ref: listed.items[1]?.ref }],
    page: { has_more: false, total: { value: 2 } },
  })
  const day = new Date(Date.now() - 2 * DAY)
  const local = (at: Date) => `${new Date(at.getTime() + 3_600_000).toISOString().slice(0, 19)}+01:00`
  const window = `started_at:[${local(new Date(day.getTime() - 3_600_000))} TO ${local(new Date(day.getTime() + 3_600_000))}}`
  const near = (await f.json("meetings", "list", window)) as { items: { ref: string }[] }
  expect(near.items.map(({ ref }) => ref)).toEqual([listed.items[0]?.ref])
})
