import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { applyTaskRulesToStored } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import { taskTriageInput } from "./task-triage-input.js"

const HOUR = 3_600_000
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()
const tg = { provider: "telegram", account: "1" }

const message = (
  id: string,
  chatId: string,
  hours: number,
  text: string,
  outgoing = false,
  replyTo?: string,
): Message => ({
  id,
  chatId,
  senderId: outgoing ? "1" : "9",
  senderName: outgoing ? null : "Kai Sample",
  timestamp: ago(hours),
  editedAt: null,
  text,
  outgoing,
  attachments: [],
  replyTo: replyTo
    ? { id: replyTo, senderId: "1", senderName: null, timestamp: null, text: "", attachments: [], outgoing: true }
    : null,
  forwardedFrom: null,
  reactions: null,
})

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-task-triage-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.accounts.saveAccount(tg, { name: "Kai Owner" })
  const harbour = await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
  await store.chats.saveChats(
    tg,
    [
      { id: "10", title: "Kai Sample", kind: "dialog" },
      { id: "12", title: "Harbour crew", kind: "group" },
      { id: "13", title: "Ferry Bot", kind: "dialog", providerMetadata: { isBot: true } },
      { id: "14", title: "News", kind: "channel" },
      { id: "777000", title: "Telegram", kind: "dialog" },
    ].map((chat) => ({ ...chat, unreadCount: 0, lastMessageAt: null, participantsCount: 2 })) as never,
  )
  await store.messages.saveMessages(
    tg,
    "10",
    [message("1", "10", 3, "Can you send the harbour plan by Friday?"), message("2", "10", 50, "Old news")],
    { via: "test" },
  )
  await store.messages.saveMessages(
    tg,
    "12",
    [
      message("3", "12", 4, "I will check the pier budget", true),
      message("4", "12", 3, "Thanks, and the crane too?", false, "3"),
      message("5", "12", 2, "Crew meets at the pier"),
    ],
    { via: "test" },
  )
  await store.messages.saveMessages(tg, "13", [message("6", "13", 1, "Your ticket is ready")], { via: "test" })
  await store.messages.saveMessages(tg, "14", [message("7", "14", 1, "Ports news")], { via: "test" })
  await store.messages.saveMessages(tg, "777000", [message("8", "777000", 1, "Login code 00000")], { via: "test" })
  await store.close()
  const run = async (environment: NodeJS.ProcessEnv, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: environment })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  return { env, root, run, harbour }
}

const input = async (env: NodeJS.ProcessEnv) => {
  const store = await openStore({ env })
  try {
    return await taskTriageInput(store, env, { schedule: "task-triage", skill: "SKILL TEXT" })
  } finally {
    await store.close()
  }
}

const chatLines = (text: string, chat: string) => {
  const block = text.split("\n\n").find((one) => one.startsWith(`## {"chat":"${chat}"`))
  return (
    block
      ?.split("\n")
      .slice(1)
      .map((line) => JSON.parse(line)) ?? []
  )
}

it("gives the task agent a day of dialogs whole and of groups only the owner's words and replies to him, without bots, channels or service chats", async () => {
  const { env, run } = await setUp()
  await run(env, "relationships", "add", "chat:telegram/1/12", "project:1")
  const text = await input(env)

  expect(text).toContain("SKILL TEXT")
  expect(chatLines(text, "chat:telegram/1/12").map((one) => [one.ref, one.sender_is_me, one.replies_to_me])).toEqual([
    ["msg:telegram/1/12/3", true, undefined],
    ["msg:telegram/1/12/4", false, true],
  ])
  expect(text).toContain('"chat":"chat:telegram/1/12","kind":"group","project":"project:1"')
  expect(chatLines(text, "chat:telegram/1/12")[0].fingerprint).toMatch(/^[0-9a-f]{64}$/)
  for (const left of ["chat:telegram/1/13", "chat:telegram/1/14", "chat:telegram/1/777000"])
    expect(text).not.toContain(left)
  expect(text).not.toContain("Old news")
})

it("puts a chat with no project of its own in its account's inbox, and counts chats with neither", async () => {
  const { env } = await setUp()
  expect(await input(env)).toContain("# Chats with no project\n2 chats moved")

  const store = await openStore({ env })
  await applyTaskRulesToStored(store, tg)
  await store.close()
  const text = await input(env)

  expect(chatLines(text, "chat:telegram/1/10").map((one) => one.ref)).toEqual(["msg:telegram/1/10/1"])
  expect(text).not.toContain("# Chats with no project")
})

it("stages a chat task under the read-only lock and leaves out the same task staged again, from any source", async () => {
  const { env, run } = await setUp()
  await run(env, "relationships", "add", "chat:telegram/1/12", "project:1")
  const line = chatLines(await input(env), "chat:telegram/1/12")[0]
  const agent = { ...env, AI_AGENT: "task-triage", MEMO_READ_ONLY: "1" }
  const batch = (key: string, title: string) =>
    JSON.stringify({
      schema_version: 1,
      key,
      extractor: "task-triage/1",
      findings: [
        {
          id: "t1",
          kind: "task",
          type: "chore",
          title,
          reason: "the owner promised it",
          commitment: "explicit",
          project: "project:1",
          evidence: [{ reference: line.ref, fingerprint: line.fingerprint }],
        },
      ],
    })

  const staged = await run(agent, "projects", "actions", "add", batch("task-triage:a:1", "Check the pier budget"))
  expect(staged.item).toMatchObject({ status: "proposed" })

  const again = await run(agent, "projects", "actions", "add", batch("task-triage:b:1", "check the pier-budget!"))
  expect(again.item).toMatchObject({
    staged: false,
    duplicates: [{ finding: "t1", duplicate_of: `proposal:${staged.item.id}`, reason: "findings.duplicate" }],
  })
  await expect(run(agent, "projects", "actions", "confirm", "1", "--fingerprint", "x")).rejects.toThrow()
})
