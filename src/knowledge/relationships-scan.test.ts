import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const setUp = async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-scan-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-scan-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.sync.applyDelta(
    { provider: "telegram", account: "1" },
    {
      chats: [
        {
          id: "77",
          kind: "group",
          title: "Synthetic Harbour site",
          unreadCount: 0,
          lastMessageAt: null,
          participantsCount: null,
        },
      ],
      people: [],
      members: new Map(),
    },
  )
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    try {
      await createProgram({ streams, env })
        .exitOverride()
        .parseAsync([...args, "--json"], { from: "user" })
      return envelopeOf(streams.stdout.join(""))
    } catch (error) {
      return { error }
    }
  }
  await run("projects", "add", "Synthetic Harbour", "--key", "SYH")
  return run
}

it("scan lists without --yes, proposes with it, and wants the accounts named", async () => {
  const run = await setUp()

  const unnamed = await run("relationships", "scan", "SYH")
  expect(String(unnamed.error)).toContain("telegram:1")

  const context = await run("projects", "context", "SYH")
  expect(context.next).toEqual([
    expect.objectContaining({ command: "relationships scan", args: { project: "SYH", source: "all" } }),
  ])

  const preview = await run("relationships", "scan", "SYH", "--source", "all")
  expect(preview.item).toMatchObject({
    written: false,
    scans: [{ proposals: [{ from: "chat:telegram/1/77", state: "dry-run", id: null }] }],
  })
  expect(preview.meta.accounts).toEqual(["telegram:1"])
  expect((await run("review", "kind:relationship")).items).toEqual([])

  const written = await run("relationships", "scan", "SYH", "--source", "telegram:1", "--yes")
  expect(written.item.scans[0].proposals[0]).toMatchObject({ from: "chat:telegram/1/77", state: "new" })
  const review = await run("review", "kind:relationship")
  expect(review.items.map((one: { id: string }) => one.id)).toEqual([written.item.scans[0].proposals[0].id])
})

it("names a group's senders, lists them by the group and lets the owner confirm them in one command", async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-scan-")), "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-scan-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const key = { provider: "telegram", account: "1" }
  const roster = Array.from({ length: 25 }, (_, n) => String(1000 + n))
  const store = await openStore({ env })
  try {
    await store.sync.applyDelta(key, {
      chats: [
        {
          id: "-88",
          kind: "group",
          title: "Synthetic sales",
          unreadCount: 0,
          lastMessageAt: null,
          participantsCount: 25,
        },
      ],
      people: roster.map((id) => ({ id, name: `Client ${id}` })),
      members: new Map([["-88", roster]]),
    })
    let id = 1
    const messages = ["1000", "1001"].flatMap((sender) =>
      Array.from({ length: 6 }, () => ({
        id: String(id++),
        chatId: "-88",
        senderId: sender,
        senderName: null,
        timestamp: new Date(Date.now() - id * 60_000).toISOString(),
        editedAt: null,
        text: "synthetic order question",
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      })),
    )
    await store.messages.saveMessages(key, "-88", messages, { via: "history" })
    const project = await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
    await store.knowledge.relate(null, { by: "owner", from: "chat:telegram/1/-88", to: project.ref, kind: "member-of" })
  } finally {
    await store.close()
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env, terminal: { present: true } })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }

  const scan = await run("relationships", "scan", "SYH", "--source", "telegram:1", "--yes")
  const [first] = scan.item.scans
  expect(first.proposals).toHaveLength(2)
  expect(first.proposals[0].signals[0].why).toMatch(/^wrote 6 messages in «Synthetic sales» \(25 people\) since /)
  expect(first.groups).toEqual([
    {
      chat: "chat:telegram/1/-88",
      title: "Chat «Synthetic sales» (Telegram)",
      people: 2,
      review: "memo review list via:chat:telegram/1/-88",
    },
  ])

  const listed = await run("review", "list", "via:chat:telegram/1/-88")
  expect(listed.items.map((one: { id: string }) => one.id).sort()).toEqual(
    first.proposals.map((one: { id: string }) => one.id).sort(),
  )
  expect(listed.next[0]).toMatchObject({ command: "review confirm" })
  expect((await run("review", "list", "via:chat:telegram/1/-99")).items).toEqual([])

  const decided = await run("review", "confirm", listed.next[0].args.ids)
  expect(decided.item.decided).toHaveLength(2)
  expect((await run("review", "list")).items).toEqual([])
})
