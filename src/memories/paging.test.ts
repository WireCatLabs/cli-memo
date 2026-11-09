import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const ROWS = 520

it("pages memories and facts past 500, each row once, newest first; actions and agents page too; --json=<fields> trims", async () => {
  const env = {
    ...process.env,
    AI_AGENT: "",
    CLAUDECODE: "",
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-paging-")), "store.db"),
  }
  const store = await openStore({ env })
  const note = await store.notes.addNote({ text: "Kai Sample prefers mornings" })
  for (let n = 0; n < ROWS; n++) {
    await store.memories.add({
      kind: "preference",
      body: `Synthetic memory ${n}`,
      scope: "work",
      evidence: [note.ref],
      author: "owner",
    })
    await store.facts.add({ type: "decision", statement: `Synthetic fact ${n}`, by: "owner", evidence: [note.ref] })
  }
  for (const tool of ["memories_list", "facts_list"]) {
    await store.proposedActions.propose({ kind: "reply", by: { bot: "helper" } })
    const call = { tier: "read" as const, status: "ok" as const, startedAt: 1, finishedAt: 2 }
    await store.agentActions.record({ ...call, actor: { bot: "memo-mcp" }, tool })
  }
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }

  for (const kind of ["memories", "facts"]) {
    const first = await run(kind, "list", "--limit", "500", "--json")
    const second = await run(kind, "list", "--limit", "500", "--page", "2", "--json")
    expect(first.page).toMatchObject({ mode: "page", limit: 500, has_more: true, next_page: 2 })
    expect(second.page).toMatchObject({ has_more: false })
    expect(second.page.next_page).toBeUndefined()
    const ids = [...first.items, ...second.items].map(({ id }: { id: string }) => Number(id))
    expect(ids).toHaveLength(ROWS)
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
  }

  const brief = await run("memories", "list", "--limit", "2", "--json=id,kind,text,status")
  expect(brief.items[0]).toEqual({
    id: expect.any(String),
    kind: "preference",
    text: `Synthetic memory ${ROWS - 1}`,
    status: expect.any(String),
  })
  expect(brief.page).toMatchObject({ has_more: true, next_page: 2 })

  for (const kind of ["actions", "agents"]) {
    const last = await run(
      kind,
      "list",
      "--limit",
      "1",
      "--page",
      "2",
      ...(kind === "actions" ? ["--brief"] : []),
      "--json",
    )
    expect(last.items).toHaveLength(1)
    expect(last.page).toMatchObject({ has_more: false })
  }
}, 120_000)
