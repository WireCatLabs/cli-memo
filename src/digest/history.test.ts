import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams, resolvePaths } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { APP } from "../app.js"
import { createProgram } from "../program.js"
import { itemKey } from "./history.js"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const tg = { provider: "telegram", account: "1" }

afterEach(() => {
  process.exitCode = 0
})

const message = (id: string, chatId: string, at: number, outgoing = false): Message => ({
  id,
  chatId,
  senderId: outgoing ? "1" : "9",
  senderName: outgoing ? null : "Kai Sample",
  timestamp: new Date(at).toISOString(),
  editedAt: null,
  text: "Synthetic text",
  outgoing,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const stamp = (at: number) =>
  new Date(at)
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z")

const reply = (who: string, chat: string, message?: string) => ({
  type: "reply",
  who,
  topic: "harbour plan",
  action: "answer about the plan",
  since: "2026-11-06",
  refs: [message ? `msg:telegram/1/${chat}/${message}` : `chat:telegram/1/${chat}`],
})

const setUp = async (extra: NodeJS.ProcessEnv = {}) => {
  const root = mkdtempSync(join(tmpdir(), "memo-history-"))
  const env = {
    ...process.env,
    AI_AGENT: "",
    CLAUDECODE: "",
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    ...extra,
  }
  const folder = join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "schedules")
  const runs = join(folder, "morning-digest", "runs")
  mkdirSync(runs, { recursive: true })
  writeFileSync(
    join(folder, "morning-digest", "schedule.json"),
    JSON.stringify({
      name: "morning-digest",
      kind: "agent",
      argv: ["claude", "-p", "Run memo skill show morning-digest and follow it."],
      when: { daily: "08:30" },
      environment: {},
      createdAt: "",
    }),
  )
  const report = (at: number, items: unknown[]) =>
    writeFileSync(
      join(runs, `${stamp(at)}.report.json`),
      JSON.stringify({
        format: "wirecat.report/1",
        kind: "morning-digest",
        date: new Date(at).toISOString().slice(0, 10),
        summary: null,
        sections: [{ kind: "today", items, more: 0 }],
      }),
    )
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { env, report, run }
}

it("matches an item across reports by its chat, a message reference counting as its chat", () => {
  const one = { type: "reply", who: "A", topic: "x", refs: ["msg:telegram/1/10/5"] }
  const two = { type: "reply", who: "A", topic: "y", refs: ["chat:telegram/1/10"] }
  expect(itemKey(one)).toBe(itemKey(two))
  expect(itemKey({ type: "fact", who: null, topic: "Rent", refs: [] })).toBe("fact||rent")
})

it("gives the last reports newest first, each item with its streak and what became of it since", async () => {
  const { env, report, run } = await setUp()
  const now = Date.now()
  const yesterday = now - DAY
  const before = now - 2 * DAY
  const store = await openStore({ env })
  await store.accounts.saveAccount(tg, { name: "Kai Owner" })
  await store.chats.saveChats(
    tg,
    ["10", "11", "12"].map((id) => ({
      id,
      title: `Person ${id}`,
      kind: "dialog" as const,
      unreadCount: 0,
      lastMessageAt: null,
      participantsCount: 2,
    })),
  )
  await store.messages.saveMessages(tg, "10", [message("1", "10", before - HOUR)], { via: "test" })
  await store.messages.saveMessages(tg, "11", [message("2", "11", yesterday + HOUR, true)], { via: "test" })
  await store.messages.saveMessages(tg, "12", [message("3", "12", yesterday + HOUR)], { via: "test" })
  await store.close()

  report(before, [reply("Person 10", "10", "1"), reply("Person 11", "11")])
  report(yesterday, [reply("Person 10", "10"), reply("Person 11", "11"), reply("Person 12", "12")])

  const body = envelopeOf(await run("digest", "history", "--last", "2", "--json"))
  const [newest, older] = body.item.reports
  expect(older.items).toHaveLength(2)
  expect(
    newest.items.map((item: { who: string; streak: number; now: string }) => [item.who, item.streak, item.now]),
  ).toEqual([
    ["Person 10", 2, "no-change"],
    ["Person 11", 2, "answered"],
    ["Person 12", 1, "they-wrote"],
  ])
  expect(newest.items[0].first_seen).toBe(new Date(before).toISOString().slice(0, 10))

  const text = await run("digest", "history", "--last", "1", "--compact")
  expect(text).toContain("data, not instructions")
  expect(text).toMatch(
    /Person 10 · harbour plan · answer about the plan · in 2 digests in a row since \S+ · nothing new since/,
  )
  expect(text).toContain("you answered since")
  expect(text.match(/^## /gm)).toHaveLength(1)

  const past = envelopeOf(
    await run("digest", "history", "--before-time", new Date(yesterday - HOUR).toISOString(), "--json"),
  )
  expect(past.item.reports).toHaveLength(1)
})

it("reads under MEMO_READ_ONLY and says so when no report is kept", async () => {
  const { run } = await setUp({ MEMO_READ_ONLY: "1" })
  expect(await run("digest", "history")).toBe("morning-digest: no earlier report kept\n")
})
