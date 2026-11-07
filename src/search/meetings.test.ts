import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { type AccountKey, type MessageStore, openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
import { callCommand } from "../../test/mcp.js"
import { updateConfig } from "../config.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"
import { allAnswer } from "./answers.js"

const work = { provider: "zoom", account: "zm-profile:work", scope: "work" as const }
const home = { provider: "zoom", account: "zm-profile:home" }

const saveMeeting = async (store: MessageStore, account: AccountKey, externalId: string, text: string) => {
  const accountId = await store.accounts.saveAccount(account, { name: "Invented" })
  const sample = sampleMeeting()
  const saved = await store.meetings.saveMeeting({
    ...sample,
    meeting: { ...sample.meeting, accountId, externalId, startedAt: Date.parse("2026-10-05T12:00:00Z") },
    transcripts: [
      {
        ...sample.transcripts[0],
        rows: [{ ...sample.transcripts[0].rows[0], speakerParticipantPosition: null, speakerName: "Alice", text }],
      },
    ],
    chat: [],
    summaries: [],
  })
  return { accountId, meetingId: saved.meeting.id }
}

const indexed = async (store: MessageStore, accountId: number) => {
  let result: { remaining: number }
  do result = await store.meetings.indexSearch({ accountId, limit: 50 })
  while (result.remaining)
}

const fixture = async ({ indexHome = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "memo-search-meetings-"))
  const env = {
    ...process.env,
    AI_AGENT: "",
    CLAUDECODE: "",
    MESSAGING_STORE: join(root, "m.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
  }
  const store = await openStore({ env })
  try {
    const atWork = await saveMeeting(store, work, "w", "Harbourlight budget for the quarter")
    const atHome = await saveMeeting(store, home, "h", "Harbourlight paint for the kitchen")
    await indexed(store, atWork.accountId)
    if (indexHome) await indexed(store, atHome.accountId)
    const note = await store.notes.addNote({ text: "Harbourlight note" })
    await store.messages.saveMessages(
      { provider: "telegram", account: "1" },
      "7",
      [
        {
          id: "1",
          chatId: "7",
          senderId: "9",
          senderName: null,
          timestamp: "2026-10-09T00:00:00Z",
          editedAt: null,
          text: "Harbourlight message",
          outgoing: false,
          attachments: [],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "test" },
    )
    return { env, atWork, atHome, note }
  } finally {
    await store.close()
  }
}

const memo = async (env: NodeJS.ProcessEnv, ...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .configureOutput({ writeErr: () => {} })
    .parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

it("finds meetings of every meeting account, personal and work, with --only meetings, each hit with a step that opens its passage", async () => {
  const { env, atWork } = await fixture()
  const found = await memo(env, "search", "all", "Harbourlight", "--only", "meetings")
  expect(found.items.map(({ account }: { account: string }) => account).sort()).toEqual([home.account, work.account])
  const hit = found.items.find(({ account }: { account: string }) => account === work.account)
  expect(hit).toEqual({
    kind: "meeting",
    ref: `meeting:${atWork.accountId}/${atWork.meetingId}`,
    provider: "zoom",
    account: work.account,
    title: expect.any(String),
    timestamp: "2026-10-05T12:00:00.000Z",
    excerpt: "Harbourlight budget for the quarter",
    offset_ms: expect.any(Number),
    scope: "transcript",
    found_by: ["words"],
    id: expect.any(String),
    cue_ref: expect.stringMatching(new RegExp(`^meeting:${atWork.accountId}/${atWork.meetingId}/\\d+/0$`)),
    sender_name: "Alice",
    language: "en",
    line: 1,
    lines_total: 1,
    untrusted: ["title", "excerpt", "sender_name"],
  })
  expect(found.next).toHaveLength(2)
  expect(found.next).toContainEqual(
    expect.objectContaining({
      step: "hit.passage",
      command: "meetings passage",
      args: { reference: hit.cue_ref, source: `zoom:${work.account}` },
    }),
  )
  const passage = await memo(env, "meetings", "passage", hit.cue_ref, "--source", `zoom:${work.account}`)
  expect(passage.target_ref).toBe(hit.cue_ref)
})

it("reads only the accounts --source names, a meeting account and the notes", async () => {
  const { env, note } = await fixture()
  const found = await memo(env, "search", "all", "Harbourlight", "--source", `zoom:${work.account},notes`)
  expect(found.items.map(({ kind, ref }: { kind: string; ref: string }) => `${kind} ${ref}`).sort()).toEqual([
    expect.stringMatching(/^meeting meeting:/),
    `note ${note.ref}`,
  ])
  expect(found.items.find(({ kind }: { kind: string }) => kind === "meeting").account).toBe(work.account)
  expect(found.meta.accounts).toEqual(expect.arrayContaining([`zoom:${work.account}`]))
  expect(found.meta.accounts).not.toContain(`zoom:${home.account}`)
  const notesOnly = await memo(env, "search", "all", "Harbourlight", "--source", "notes")
  expect(notesOnly.items.map(({ kind }: { kind: string }) => kind)).toEqual(["note"])
  expect(notesOnly.missing.filter(({ why }: { why: string }) => why.includes("meetings"))).toEqual([])
})

it("names a meeting account whose index is not built yet, with the command that builds it", async () => {
  const { env } = await fixture({ indexHome: false })
  const found = await memo(env, "search", "all", "Harbourlight", "--only", "meetings")
  expect(found.items.map(({ account }: { account: string }) => account)).toEqual([work.account])
  expect(found.missing).toContainEqual({
    field: "items",
    why: `zoom:${home.account}: meetings saved since its search index was last built are not found yet`,
    step: "meetings.index",
  })
  expect(found.next[0]).toMatchObject({
    step: "meetings.index",
    command: "search meetings",
    args: { query: "Harbourlight", source: `zoom:${home.account}` },
    line: `memo search meetings Harbourlight --source zoom:${home.account}`,
  })
})

it("puts the step that syncs a chat held in part before the steps that open meeting hits", () => {
  const hit = (cue: number) => ({
    kind: "meeting" as const,
    ref: "meeting:1/1",
    provider: "zoom",
    account: "zm-profile:work",
    accountId: 1,
    title: null,
    timestamp: null,
    text: "Harbourlight",
    meetingId: 1,
    scope: "transcript" as const,
    id: cue,
    startMs: 0,
    cueRef: `meeting:1/1/1/${cue}`,
    foundBy: ["words" as const],
  })
  const answer = allAnswer(
    {
      query: "Harbourlight",
      items: [hit(0), hit(1)],
      hasMore: false,
      searched: ["messages", "meetings"],
      skipped: [],
      accounts: [],
      coverage: {
        next: true,
        chat: "7",
        messages: 1,
        coveredChats: 1,
        chats: { neverFetched: 0, behind: 1, withGaps: 0 },
      } as never,
      tasks: [],
      tasksIncomplete: false,
    },
    10,
  )
  expect(answer.next?.map(({ step }) => step)).toEqual(["messages.sync", "hit.passage"])
})

it("leaves meetings out and says so unless the permissions let searching and opening them go ahead", async () => {
  for (const [key, level] of [
    ["search.meetings", "deny"],
    ["meetings.passage", "deny"],
    ["meetings.passage", "ask"],
  ] as const) {
    const { env } = await fixture()
    updateConfig((config) => ({ ...config, permissions: { [key]: level } }), env)
    const found = await memo(env, "search", "all", "Harbourlight")
    expect(found.items.map(({ kind }: { kind: string }) => kind).sort()).toEqual(["message", "note"])
    expect(found.missing).toContainEqual({
      field: "items",
      why: `meetings left out: the permissions set ${key} to ${level}`,
    })
    await expect(memo(env, "search", "all", "Harbourlight", "--only", "meetings")).rejects.toMatchObject({
      code: "permission_error",
    })
  }
})

it("answers an MCP search all with a meeting hit's passage step, and leaves meetings out under the server's own levels", async () => {
  const { env } = await fixture()
  const call = async (overrides: string[] = []) => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer(env, createProgram, overrides).connect(serverSide)
    const client = new Client({ name: "synthetic", version: "1" })
    await client.connect(clientSide)
    try {
      const result = await callCommand(client, { name: "search all", arguments: { query: "Harbourlight" } })
      return envelopeOf(JSON.stringify(result.structuredContent))
    } finally {
      await client.close()
    }
  }
  const found = await call()
  expect(found.items.some(({ kind }: { kind: string }) => kind === "meeting")).toBe(true)
  expect(found.next).toContainEqual(expect.objectContaining({ step: "hit.passage", command: "meetings passage" }))
  const denied = await call(["meetings.passage=deny"])
  expect(denied.items.some(({ kind }: { kind: string }) => kind === "meeting")).toBe(false)
  expect(denied.missing).toContainEqual({
    field: "items",
    why: "meetings left out: the permissions set meetings.passage to deny",
  })
})
