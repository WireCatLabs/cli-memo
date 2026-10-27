import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

it("searches three typed resources together, separates mail and messages, and filters native note/message types", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-resources-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  const message = {
    id: "1",
    chatId: "7",
    senderId: "9",
    senderName: null,
    timestamp: "2026-10-09T00:00:00Z",
    editedAt: null,
    text: "Sharedsignal synthetic",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }
  await store.messages.saveMessages({ provider: "telegram", account: "1" }, "7", [message], { via: "test" })
  await store.messages.saveMessages({ provider: "email", account: "mailbox" }, "7", [message], { via: "test" })
  const internal = await store.notes.addNote({ text: "Sharedsignal internal" })
  const folder = await store.notes.addFolder({ name: "Unbound synthetic folder" })
  const file = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "plan.md",
    title: "Plan",
    text: "Sharedsignal file",
  })
  await store.accounts.saveAccount({ provider: "notes", account: "synthetic-legacy" }, { name: null })
  await store.tasks.insert({
    id: "legacy-note-task",
    source: file.note.ref,
    sourceKind: "note",
    account: "notes:synthetic-legacy",
    group: file.note.ref,
    kind: "request",
    state: "open",
    origin: "owner",
    createdAt: new Date("2026-10-09T00:00:00Z"),
  })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    const override = (command: Command) => {
      command.exitOverride()
      command.configureOutput({ writeErr: () => {} })
      for (const child of command.commands) override(child)
    }
    override(program)
    await program.parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const all = await run("search", "all", "Sharedsignal", "--exact")
  expect(all.next.map(({ args }: { args: { query: string } }) => args.query)).toEqual([`source:"${file.note.ref}"`])
  expect(all.items.map((item: { kind: string }) => item.kind).sort()).toEqual(["mail", "message", "note", "note"])
  expect(all.items.map((item: { ref: string }) => item.ref)).toEqual(
    expect.arrayContaining([internal.ref, file.note.ref]),
  )
  expect((await run("search", "messages", "Sharedsignal")).items.map((item: { ref: string }) => item.ref)).toEqual([
    "msg:telegram/1/7/1",
  ])
  await expect(run("search", "messages", "Sharedsignal AND in:email")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("search mail"),
  })
  expect((await run("search", "mail", "Sharedsignal")).items.map((item: { ref: string }) => item.ref)).toEqual([
    "msg:email/mailbox/7/1",
  ])
  expect((await run("search", "messages", "Sharedsignal NOT has:attachment")).items).toHaveLength(1)
  expect((await run("search", "messages", "Sharedsignal has:file")).items).toEqual([])
  expect(
    (await run("search", "notes", "Sharedsignal source:internal")).items.map((hit: { ref: string }) => hit.ref),
  ).toEqual([internal.ref])
  expect(
    (await run("search", "notes", "Sharedsignal", "--source", `notes:${folder.id}`)).items.map(
      (hit: { ref: string }) => hit.ref,
    ),
  ).toEqual([file.note.ref])
  for (const args of [
    ["search", "Sharedsignal"],
    ["notes", "search", "Sharedsignal"],
    ["search", "all", "Sharedsignal", "--all"],
    ["search", "notes", "Sharedsignal", "--source", "file"],
  ])
    await expect(run(...args)).rejects.toHaveProperty("code")
})

it("searches every mail account, or with --source only that address", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-mail-accounts-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  const message = {
    id: "1",
    chatId: "7",
    senderId: "9",
    senderName: null,
    timestamp: "2026-10-09T00:00:00Z",
    editedAt: null,
    text: "Lighthouse synthetic",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }
  for (const account of ["alice@example.com", "bob@example.com"])
    await store.messages.saveMessages({ provider: "email", account }, "7", [message], { via: "test" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    const override = (command: Command) => {
      command.exitOverride()
      command.configureOutput({ writeErr: () => {} })
      for (const child of command.commands) override(child)
    }
    override(program)
    await program.parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
      .items.map((item: { ref: string }) => item.ref)
      .sort()
  }

  expect(await run("search", "mail", "Lighthouse")).toEqual([
    "msg:email/alice%40example.com/7/1",
    "msg:email/bob%40example.com/7/1",
  ])
  expect(await run("search", "mail", "Lighthouse", "--source", "email:bob@example.com")).toEqual([
    "msg:email/bob%40example.com/7/1",
  ])
  await expect(run("search", "mail", "Lighthouse", "--source", "email:carol@example.com")).rejects.toMatchObject({
    code: "not_found",
    message: expect.stringContaining("alice@example.com, bob@example.com"),
  })
  expect(await run("search", "mail", "Lighthouse", "--source", "email:bob@example.com")).toEqual([
    "msg:email/bob%40example.com/7/1",
  ])
  expect(await run("search", "mail", "Lighthouse", "--source", "email")).toHaveLength(2)
  await expect(run("search", "mail", "Lighthouse", "--source", "notes")).rejects.toMatchObject({
    code: "validation_error",
  })

  const streams = captureStreams()
  await createProgram({ streams, env }).parseAsync(
    ["search", "mail", "Lighthouse", "--source", "email:bob@example.com", "--json"],
    { from: "user" },
  )
  expect(streams.stderr.join("")).toBe("")
})

it("shows each email reference first, with its people, labels, subject and an excerpt, at the detail asked", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-mail-detail-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  const accountId = await store.accounts.saveAccount(
    { provider: "email", account: "owner@example.com" },
    { name: null },
  )
  const body = `${"Notes from the planning call. ".repeat(12)}The offsite budget is approved.`
  await store.mail.saveThread({
    accountId,
    externalId: "thread-1",
    now: Date.UTC(2026, 9, 1),
    emails: [
      {
        externalId: "<one@example.com>",
        subject: "Offsite",
        from: { address: "alice@example.com", name: "Alice Example" },
        to: [{ address: "bob@example.com", name: "Bob Sample" }],
        cc: [{ address: "kai@example.com", name: "Kai Sample" }],
        sentAt: Date.UTC(2026, 9, 1),
        bodyText: body,
        mailboxes: [{ externalId: "starred", name: "Starred", kind: null }],
      },
    ],
  })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    const override = (command: Command) => {
      command.exitOverride()
      command.configureOutput({ writeErr: () => {} })
      for (const child of command.commands) override(child)
    }
    override(program)
    await program.parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }

  const shown = await run("search", "mail", "budget")
  expect(shown.split("\n")).toEqual([
    "msg:email/owner%40example.com/thread-1/%3Cone%40example.com%3E",
    "  2026-10-01T00:00:00.000Z  Alice Example  to Bob Sample · cc Kai Sample · Starred",
    "  Offsite",
    expect.stringMatching(/^ {2}….*The offsite budget is approved\.$/),
    "",
  ])
  expect(shown).not.toContain(body)
  expect(await run("search", "mail", "budget", "--full")).toContain(body)

  const [hit] = answerOf(await run("search", "mail", "budget", "--json")).items
  expect(hit).not.toHaveProperty("text")
  expect(hit.email).toMatchObject({
    to: [{ address: "bob@example.com" }],
    cc: [{ address: "kai@example.com" }],
    labels: ["Starred"],
  })
  expect(Object.keys(answerOf(await run("search", "mail", "budget", "--json", "--brief")).items[0]).sort()).toEqual([
    "chat_title",
    "excerpt",
    "ref",
    "score",
    "sender_name",
    "timestamp",
  ])
})

it("narrows a search to the text of files with content:, in search messages and search all", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-attachment-text-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const key = { provider: "telegram", account: "1" }
  const store = await openStore({ env })
  await store.messages.saveMessages(
    key,
    "7",
    [
      {
        id: "1",
        chatId: "7",
        senderId: "9",
        senderName: null,
        timestamp: "2026-10-09T00:00:00Z",
        editedAt: null,
        text: "see attached",
        outgoing: false,
        attachments: [{ kind: "file", name: "a.pdf" }],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "test" },
  )
  const [file] = await store.attachments.fileAttachments(key, { limit: 10 })
  await store.attachments.keepAttachmentText(file?.pk as number, {
    text: "Synthetic invoice 42",
    origin: "agent",
    extractor: "agent",
  })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join("")).items.map(
      (item: { locator?: string; ref?: string }) => item.locator ?? item.ref,
    )
  }
  expect(await run("search", "messages", "content:invoice")).toEqual(["msg:telegram/1/7/1"])
  expect(await run("search", "all", "content:invoice")).toEqual(["msg:telegram/1/7/1"])
})

it("search all runs as no stored account and names every account it read", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-all-accounts-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  const message = {
    id: "1",
    chatId: "7",
    senderId: "9",
    senderName: null,
    timestamp: "2026-10-09T00:00:00Z",
    editedAt: null,
    text: "Beaconword synthetic",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  }
  for (const key of [
    { provider: "email", account: "a@example.com" },
    { provider: "max", account: "2" },
    { provider: "telegram", account: "1" },
  ])
    await store.messages.saveMessages(key, "7", [message], { via: "test" })
  const folder = await store.notes.addFolder({ name: "Synthetic folder" })
  const drive = await store.notes.documentsAccount({ provider: "google-drive", account: "u1" }, true)
  await store.close()
  const streams = captureStreams()
  await createProgram({ streams, env }).parseAsync(["search", "all", "Beaconword", "--json"], { from: "user" })
  const answer = answerOf(streams.stdout.join(""))
  expect(answer.items.map((item: { ref: string }) => item.ref).sort()).toEqual([
    "msg:email/a%40example.com/7/1",
    "msg:max/2/7/1",
    "msg:telegram/1/7/1",
  ])
  expect(answer.meta.accounts.sort()).toEqual(
    ["max:2", "telegram:1", "email:a@example.com", "notes:internal", `notes:${folder.id}`, `notes:${drive?.id}`].sort(),
  )

  const text = captureStreams()
  await createProgram({ streams: text, env }).parseAsync(["search", "all", "Beaconword"], { from: "user" })
  expect(text.stderr.join("")).toContain("searched: ")
  expect(text.stderr.join("")).toContain("telegram:1")
})

it("search all finds calendar events in every calendar, names each one read, and --only events reads them alone", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-all-events-"))
  const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  const store = await openStore({ env })
  await store.accounts.registerProvider({ name: "google-calendar", kind: "events", aliases: ["gcal"], command: "gcal" })
  for (const account of ["work@example.test", "home@example.test"]) {
    const id = await store.accounts.saveAccount({ provider: "google-calendar", account }, { name: null })
    const [calendar] = await store.calendar.saveCalendars(
      id,
      [
        {
          externalId: "primary",
          title: "Main",
          timezone: "UTC",
          accessRole: "owner",
          primary: true,
          syncByDefault: true,
        },
      ],
      1,
    )
    await store.calendar.saveEntries(
      calendar?.id as number,
      [
        {
          externalId: `quillmark-${account}`,
          kind: "single",
          status: "confirmed",
          title: `Quillmark planning ${account.split("@")[0]}`,
          startsAt: Date.UTC(2099, 0, 5, 9),
          endsAt: Date.UTC(2099, 0, 5, 10),
        },
      ],
      1,
    )
  }
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
        text: "Quillmark notes",
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "test" },
  )
  await store.close()
  const search = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).parseAsync(["search", "all", ...args], { from: "user" })
    return streams
  }

  const answer = answerOf((await search("Quillmark", "--exact", "--json")).stdout.join(""))
  expect(answer.items.map((item: { kind: string }) => item.kind).sort()).toEqual(["event", "event", "message"])
  expect(answer.meta.accounts).toEqual(
    expect.arrayContaining(["google-calendar:work@example.test", "google-calendar:home@example.test", "telegram:1"]),
  )

  const events = answerOf((await search("Quillmark", "--exact", "--only", "events", "--json")).stdout.join(""))
  expect(events.items.map((item: { title: string }) => item.title).sort()).toEqual([
    "Quillmark planning home",
    "Quillmark planning work",
  ])
  expect(events.items[0].ref).toMatch(/^event:\d+$/)
  expect(events.items[0].untrusted).toEqual(["title", "excerpt"])
  expect(answer.items.find((item: { kind: string }) => item.kind === "message")?.untrusted).toEqual([
    "title",
    "excerpt",
    "sender_name",
  ])
  expect(events.meta.accounts.sort()).toEqual([
    "google-calendar:home@example.test",
    "google-calendar:work@example.test",
  ])

  const text = await search("Quillmark", "--only", "events")
  expect(text.stderr.join("")).toContain("google-calendar:work@example.test")
  expect(text.stderr.join("")).toMatch(/Events by words only: /)
  expect(text.stdout.join("")).toMatch(/event {2}event:\d+/)
})
