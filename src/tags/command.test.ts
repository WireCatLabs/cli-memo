import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { formatLocator, type Message } from "@leemour/cli-messaging"
import { messagesService, storeOnlyDeps } from "@leemour/cli-messaging/services"
import { openStore } from "@leemour/cli-messaging/store"
import { beforeEach, describe, expect, it } from "vitest"
import { APP } from "../app.js"
import { himalaya } from "../mail/himalaya.js"
import { importMail } from "../mail/import.js"
import { createProgram } from "../program.js"

let env: NodeJS.ProcessEnv
let vault: string
let otherVault: string
let mailbox: string
const path = "Projects/Lighthouse.md"
const mail = { provider: "email", account: "owner@example.test" }
const otherMail = { provider: "email", account: "other@example.test" }
const tg = { provider: "telegram", account: mail.account }
const noteLocator = () => formatLocator({ provider: "notes", account: vault, chat: "Projects", message: path })
const mailLocator = () => formatLocator({ ...mail, chat: "7", message: "42" })

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}
const json = async (...args: string[]) => JSON.parse(await run(...args, "--json"))

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-tags-"))
  vault = join(dir, "vault one")
  otherVault = join(dir, "vault two")
  mailbox = join(dir, "mailbox.json")
  env = { ...process.env, MESSAGING_STORE: join(dir, "messages.db"), MEMO_FAKE_MAILBOX: mailbox }
  for (const folder of [vault, otherVault]) {
    mkdirSync(join(folder, "Projects"), { recursive: true })
    writeFileSync(join(folder, path), "Lighthouse budget.\n")
    writeFileSync(join(folder, "Projects/Harbour.md"), "Harbour budget.\n")
    await run("notes", "import", "--folder", folder, "--no-embed")
  }
  writeFileSync(
    mailbox,
    JSON.stringify({
      messages: [
        {
          uid: "1",
          messageId: "42",
          threadId: "7",
          receivedAt: "2026-09-11T08:00:00Z",
          subject: "Lighthouse budget",
          from: ["Rin Example", "rin@example.test"],
          to: [[null, mail.account]],
          text: "Synthetic budget email.",
        },
      ],
    }),
  )
  const store = await openStore({ env })
  try {
    for (const key of [mail, otherMail])
      await importMail({
        store,
        run: himalaya(env),
        account: { name: "test", address: key.account },
        since: new Date("2026-09-01"),
      })
    const message: Message = {
      id: "42",
      chatId: "7",
      senderId: null,
      senderName: null,
      timestamp: "2026-09-11T08:00:00Z",
      editedAt: null,
      text: "Lighthouse budget",
      outgoing: true,
      attachments: [],
      replyTo: null,
      forwardedFrom: null,
      reactions: null,
    }
    await store.saveMessages(tg, "7", [message], { via: "test" })
  } finally {
    await store.close()
  }
  env.MEMO_HIMALAYA = "/not-a-mail-command"
})

describe("memo source tags", () => {
  it("normalizes and deduplicates labels on an imported note without editing its file", async () => {
    const before = readFileSync(join(vault, path))
    const added = await json("tags", "add", "Work", "work", "FOLLOW-UP", "--message", noteLocator())
    expect(added).toMatchObject({ provider: "notes", account: vault, added: ["work", "follow-up"], unchanged: [] })
    expect(added.target).toEqual({ type: "message", chatId: "Projects", messageId: path, locator: noteLocator() })
    expect(await json("tags", "add", "work", "--message", noteLocator())).toMatchObject({
      added: [],
      unchanged: ["work"],
    })
    expect(readFileSync(join(vault, path))).toEqual(before)
    const listed = await json("tags", "list", "--provider", "notes", "--account", vault, "--tag", "WORK")
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]).toMatchObject({ tag: "work", locator: noteLocator(), account: vault })
  })

  it("isolates identical email message and thread ids by account and provider, and shared search finds the label", async () => {
    const before = readFileSync(mailbox)
    await json("tags", "add", "follow-up", "--message", mailLocator())
    const store = await openStore({ env })
    try {
      expect(await store.tags(otherMail)).toEqual([])
      expect(await store.tags(tg)).toEqual([])
      const answer = await messagesService(storeOnlyDeps(store, mail, { app: APP, env })).search({
        text: "tag:follow-up",
        limit: 10,
      })
      expect(answer.items.map((hit) => hit.locator)).toEqual([mailLocator()])
    } finally {
      await store.close()
    }
    expect(readFileSync(mailbox)).toEqual(before)
    expect((await json("tags", "list", "--provider", "email", "--account", otherMail.account)).items).toEqual([])
  })

  it("uses tag eligibility in notes search, including folder tags and account isolation", async () => {
    await json("tags", "add", "selected", "--message", noteLocator())
    const one = await json("notes", "search", "budget", "--tag", "selected")
    expect(one.tag).toBe("selected")
    expect(one.hits.map((hit: { locator: string }) => hit.locator)).toEqual([noteLocator()])
    await json("tags", "add", "project", "--chat", "Projects", "--provider", "notes", "--account", vault)
    const folder = await json("notes", "search", "budget", "--tag", "project")
    expect(folder.hits).toHaveLength(2)
    expect(folder.hits.every((hit: { folder: string }) => hit.folder === vault)).toBe(true)
  })

  it("labels an email thread and removes tags idempotently", async () => {
    const args = ["--chat", "7", "--provider", "email", "--account", mail.account]
    expect(await json("tags", "add", "work", ...args)).toMatchObject({
      target: { type: "chat", chatId: "7" },
      added: ["work"],
    })
    expect((await json("tags", "list", "--type", "chat")).items).toHaveLength(1)
    expect(await json("tags", "remove", "work", ...args)).toMatchObject({ removed: ["work"], unchanged: [] })
    expect(await json("tags", "remove", "work", ...args)).toMatchObject({ removed: [], unchanged: ["work"] })
  })

  it("preserves labels through edits and hides deleted sources from listing and search", async () => {
    await json("tags", "add", "work", "--message", noteLocator())
    writeFileSync(join(vault, path), "Lighthouse revised budget.\n")
    await run("notes", "import", "--folder", vault, "--no-embed")
    expect((await json("notes", "search", "revised", "--tag", "work")).hits).toHaveLength(1)
    rmSync(join(vault, path))
    await run("notes", "import", "--folder", vault, "--no-embed")
    expect((await json("tags", "list", "--tag", "work")).items).toEqual([])
    expect((await json("notes", "search", "lighthouse", "--tag", "work")).hits).toEqual([])
    expect(await run("notes", "search", "lighthouse", "--tag", "work")).toContain("No note tagged work")
    await expect(json("tags", "add", "again", "--message", noteLocator())).rejects.toMatchObject({ code: "not_found" })
  })

  it("refuses malformed targets, conflicting scopes and invalid labels without partial writes", async () => {
    for (const args of [
      ["work"],
      ["work", "--chat", "Projects"],
      ["work", "--message", "msg:notes/a/b/%ZZ"],
      ["work", "--message", noteLocator(), "--account", otherVault],
      ["work", "--message", noteLocator(), "--chat", "Projects"],
      ["work", "invalid tag", "--message", noteLocator()],
    ])
      await expect(json("tags", "add", ...args)).rejects.toMatchObject({ code: "validation_error" })
    expect((await json("tags", "list")).items).toEqual([])
    await expect(json("tags", "list", "--account", vault)).rejects.toMatchObject({ code: "validation_error" })
    await expect(json("tags", "list", "--provider", "notes", "--account", "missing")).rejects.toMatchObject({
      code: "not_found",
    })
  })

  it("refuses unknown exact chat ids instead of guessing a title", async () => {
    await expect(
      json("tags", "add", "work", "--chat", "Lighthouse", "--provider", "notes", "--account", vault),
    ).rejects.toMatchObject({ code: "not_found" })
    await expect(
      json("tags", "add", "work", "--message", formatLocator({ ...mail, chat: "7", message: "999" })),
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("bounds tag listing and prints readable source references", async () => {
    const text = await run("tags", "add", "first", "second", "--message", noteLocator())
    expect(text).toContain(noteLocator())
    const page = await json("tags", "list", "--limit", "1")
    expect(page.items).toHaveLength(1)
    expect(page.hasMore).toBe(true)
    expect(await run("tags", "list", "--limit", "1")).toContain("More labels match")
  })
})
