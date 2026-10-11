import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-messaging/store"
import { beforeEach, expect, it } from "vitest"
import { createProgram } from "../program.js"

let env: NodeJS.ProcessEnv
const account = { provider: "example", account: "alice-example" }

const json = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--json"], { from: "user" })
  return JSON.parse(streams.stdout.join(""))
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-records-"))
  env = {
    ...process.env,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
  }
  const store = await openStore({ env })
  try {
    await store.saveAccount(account, { name: "Alice Example" })
  } finally {
    await store.close()
  }
})

it("adds a memory of the owner's as confirmed, finds it, and marks it stale", async () => {
  const note = await json("notes", "add", "Bob Sample prefers Fridays")
  const memory = await json(
    "memories",
    "add",
    "Bob Sample prefers meetings on Fridays",
    "--kind",
    "preference",
    "--scope",
    "work",
    "--evidence",
    note.note.ref,
  )
  expect(memory).toMatchObject({ status: "confirmed", scope: "work", evidence: [note.note.ref] })

  expect(
    (await json("memories", "list", "--status", "confirmed")).items.map(({ ref }: { ref: string }) => ref),
  ).toEqual([memory.ref])
  expect((await json("memories", "search", "Fridays")).items.map(({ ref }: { ref: string }) => ref)).toEqual([
    memory.ref,
  ])
  expect(await json("memories", "stale", memory.ref)).toMatchObject({ status: "stale" })
  expect(await json("memories", "show", memory.ref)).toMatchObject({ ref: memory.ref, status: "stale" })
})

it("approves a proposed action as a task in the account that would act, and rejects another", async () => {
  const scope = ["--provider", account.provider, "--account", account.account]
  const reply = await json(
    "actions",
    "propose",
    "reply",
    "--reason",
    "Bob Sample asked twice",
    ...scope,
    "--payload",
    '{"text":"Friday works"}',
  )
  const ban = await json("actions", "propose", "ban", "--reason", "spam", ...scope)
  expect(reply).toMatchObject({ status: "proposed", account, payload: { text: "Friday works" } })

  const approved = await json("actions", "approve", reply.id)
  expect(approved.proposal).toMatchObject({ status: "approved", result: { task: approved.task.id } })
  expect(await json("actions", "reject", ban.id)).toMatchObject({ status: "rejected" })
  expect((await json("actions", "list", "--status", "proposed")).items).toEqual([])
  const tasks = await json("tasks", "list", ...scope)
  expect(JSON.stringify(tasks)).toContain(approved.task.id)
})

it("lists the agent log by agent, with each agent's name", async () => {
  const store = await openStore({ env })
  try {
    const call = { tier: "read" as const, status: "ok" as const, startedAt: 1, finishedAt: 2 }
    await store.agentActions.record({ ...call, actor: { bot: "tg-mcp" }, tool: "messages_list" })
    await store.agentActions.record({ ...call, actor: { bot: "memo-mcp" }, tool: "memories_add" })
  } finally {
    await store.close()
  }

  expect((await json("agents", "log", "--agent", "memo-mcp")).items).toMatchObject([
    { tool: "memories_add", actor: { name: "memo-mcp" } },
  ])
  expect((await json("agents", "log")).items).toHaveLength(2)
})
