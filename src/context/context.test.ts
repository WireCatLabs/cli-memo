import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Chat, Message } from "@wirecat/cli-core"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { answerOf } from "../../test/answer.js"
import { addFolderNotes, addNote } from "../../test/notes.js"
import { createProgram } from "../program.js"

const tg = { provider: "telegram", account: "1" }
const mail = { provider: "email", account: "owner@example.test" }

const message = (
  id: string,
  chatId: string,
  senderId: string,
  outgoing: boolean,
  text: string,
  at: string,
): Message => ({
  id,
  chatId,
  senderId,
  senderName: outgoing ? "Owner" : "Rin Example",
  timestamp: at,
  editedAt: null,
  text,
  outgoing,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const chat = (id: string, title: string): Chat => ({
  id,
  title,
  kind: "dialog",
  unreadCount: null,
  lastMessageAt: "2026-09-12T08:00:00Z",
  participantsCount: 2,
})

let env: NodeJS.ProcessEnv

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "context-"))
  env = {
    ...process.env,
    MESSAGING_STORE: join(dir, "messages.db"),
    WCAT_CONFIG_DIR: join(dir, "config"),
    WCAT_STATE_DIR: join(dir, "state"),
  }

  const store = await openStore({ env })
  await store.sync.applyDelta(tg, { chats: [chat("101", "Rin Example")], people: [{ id: "101", name: "Rin Example" }] })
  await store.messages.saveMessages(
    tg,
    "101",
    [
      message("1", "101", "101", false, "Are we still on for Friday?", "2026-09-10T08:00:00Z"),
      message("2", "101", "999", true, "Yes, see you then.", "2026-09-10T09:00:00Z"),
    ],
    { via: "test" },
  )
  await store.roster.saveMembers(tg, "101", ["101", "999"])
  await store.sync.applyDelta(mail, { chats: [chat("t1", "Budget")] })
  await store.messages.saveMessages(
    mail,
    "t1",
    [message("m1", "t1", "rin@example.test", false, "Budget attached.", "2026-09-11T08:00:00Z")],
    { via: "test" },
  )
  await store.close()
})

/** The owner's vault as files sync stores it: a note about Rin, a meeting that links it, a call that links Rin. */
const vaultOf = (uid: string) =>
  addFolderNotes(env, {
    "People/Rin Example.md": "Works on the lighthouse.\n",
    "Meeting.md": { text: "Kickoff.\n[[Rin Example]] will send the budget.\n", links: ["People/Rin Example.md"] },
    "Call.md": {
      text: `Called [[person:${uid}]] about Friday.\nRin Example sounded busy.\n`,
      links: [`person:${uid}`],
    },
  })

/** The owner's own link from a note to the person it is about, as `files notes links add` writes it. */
const aboutLink = async (uid: string, ref: string) => {
  const store = await openStore({ env })
  try {
    await store.notes.addLink({ from: ref, to: `person:${uid}`, kind: "about", origin: "owner", by: "owner" })
  } finally {
    await store.close()
  }
}

describe("wcat context", () => {
  beforeEach(() => vi.stubEnv("TZ", "UTC"))
  afterEach(() => vi.unstubAllEnvs())
  it("finds direct messages in a private dialog without recorded members", async () => {
    const store = await openStore({ env })
    await store.roster.saveMembers(tg, "101", [])
    await store.close()

    const answer = answerOf(await run("context", "telegram:101", "--json"))

    expect(answer.messages.last.from_them?.id).toBe("1")
    expect(answer.proposals).toEqual({ count: 0, kinds: {}, complete: true, next: { command: "review list" } })
    expect(answer.messages.last.from_me?.id).toBe("2")
    expect(answer.messages.recent.direct.map(({ id }: { id: string }) => id)).toEqual(["2", "1"])
  })

  it("joins messages, linked mail and notes about one person", async () => {
    const store = await openStore({ env })
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "email", id: "rin@example.test" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    await store.close()
    const { notes } = await vaultOf(uid)
    await aboutLink(uid, notes[0]?.ref as string)
    await addNote(env, "Prefers mornings", { subject: ["email:rin@example.test"] })

    const answer = answerOf(await run("context", "telegram:Rin Example", "--json"))

    expect(answer.messages.person.identities.map(({ provider }: { provider: string }) => provider).sort()).toEqual([
      "email",
      "telegram",
    ])
    expect(answer.messages.last.from_them.text).toBe("Are we still on for Friday?")
    expect(answer.messages.last.from_them_anywhere.text).toBe("Budget attached.")
    expect(answer.messages.last.from_me.text).toBe("Yes, see you then.")
    expect(answer.notes.about.map(({ path }: { path: string }) => path)).toEqual(["People/Rin Example.md"])
    expect(answer.notes.linking.map(({ path }: { path: string }) => path)).toEqual(["Call.md"])
    expect(answer.notes.through_notes.map(({ path }: { path: string }) => path)).toEqual(["Meeting.md"])
    expect(answer.your_notes.map(({ text }: { text: string }) => text)).toEqual(["Prefers mornings"])
    expect(answer.not_read.map(({ source }: { source: string }) => source)).toEqual(["events"])
  })

  it("leaves out the notes of a folder --source does not name, and keeps the owner's own", async () => {
    const store = await openStore({ env })
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    await store.close()
    const { notes } = await vaultOf(uid)
    await aboutLink(uid, notes[0]?.ref as string)
    await addNote(env, "Prefers mornings", { subject: ["telegram:101"] })

    const all = answerOf(await run("context", `person:${uid}`, "--json"))
    expect(all.notes.about.map(({ path }: { path: string }) => path)).toEqual(["People/Rin Example.md"])
    const scoped = answerOf(await run("context", `person:${uid}`, "--source", "telegram:1", "--json"))
    expect(scoped.notes.about).toEqual([])
    expect(scoped.your_notes.map(({ text }: { text: string }) => text)).toEqual(["Prefers mornings"])
    const reader = await openStore({ env })
    const folder = (await reader.notes.folders())[0]?.id as string
    await reader.close()
    const named = answerOf(await run("context", `person:${uid}`, "--source", `telegram:1,notes:${folder}`, "--json"))
    expect(named.notes.about.map(({ path }: { path: string }) => path)).toEqual(["People/Rin Example.md"])
    await run("groups", "add", "work", "telegram:1")
    env = { ...env, WCAT_GROUP: "work" }
    const grouped = answerOf(await run("context", `person:${uid}`, "--json"))
    expect(grouped.notes.about).toEqual([])
    expect(grouped.your_notes.map(({ text }: { text: string }) => text)).toEqual(["Prefers mornings"])
  })

  it("takes a person reference and reads every account that saw the person, with no --source (BUG-584)", async () => {
    const store = await openStore({ env })
    const alone = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    expect(answerOf(await run("context", `person:${alone}`, "--json")).messages.person.uid).toBe(alone)
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "email", id: "rin@example.test" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    await store.sync.applyDelta(mail, { people: [{ id: "rin@example.test", name: "Rin Example" }] })
    await store.close()

    const both = answerOf(await run("context", `person:${uid}`, "--json"))
    expect(both.coverage.accounts).toEqual(["email:owner@example.test", "telegram:1"])
    expect(both.messages.last.from_them_anywhere.text).toBe("Budget attached.")
    const answer = answerOf(await run("context", `person:${uid}`, "--source", "telegram:1", "--json"))

    expect(answer.messages.person.uid).toBe(uid)
    expect(answer.coverage.accounts).toEqual(["telegram:1"])
    expect(answer.messages.last.from_them.text).toBe("Are we still on for Friday?")
    await expect(run("context", "person:99999", "--json")).rejects.toThrow(/no person:99999/)
  })

  it("lists the recorded calls and meetings they took part in beside the events, not inside messages", async () => {
    const store = await openStore({ env })
    const key = { provider: "example", account: "synthetic" }
    const sample = sampleMeeting()
    sample.meeting.accountId = await store.accounts.saveAccount(key, { name: null })
    sample.meeting.startedAt = Date.parse("2026-10-05T12:00:00Z")
    sample.meeting.endedAt = sample.meeting.startedAt + 1000
    const saved = await store.meetings.saveMeeting(sample)
    const uid = (await store.people.personOf({ provider: "example", id: "alice-example" }))?.uid as string
    await store.close()

    const answer = answerOf(await run("context", `person:${uid}`, "--json"))
    expect(answer.meetings).toEqual([
      expect.objectContaining({ meeting_id: saved.meeting.id, account: key, people: [`person:${uid}`] }),
    ])
    expect(answer.messages).not.toHaveProperty("meetings")
    expect(await run("context", `person:${uid}`)).toMatch(/Calls and meetings\n {2}2026-10-05 12:00 .* meeting:/)
  })

  it("leads with the history, newest first across sources, and pages back from history.before_time", async () => {
    const first = answerOf(await run("context", "telegram:101", "--limit", "1", "--json"))

    expect(first.history.items).toEqual([
      expect.objectContaining({ kind: "message", at: "2026-09-10T09:00:00.000Z", text: "Yes, see you then." }),
    ])
    expect(first.history).toMatchObject({ has_more: true, before_time: "2026-09-10T08:59:59.999Z" })
    expect(first.untrusted).toEqual(expect.arrayContaining(["history.items.text", "meetings.snippet"]))
    const older = answerOf(
      await run("context", "telegram:101", "--limit", "1", "--before-time", first.history.before_time, "--json"),
    )
    expect(older.history.items.map(({ text }: { text: string }) => text)).toEqual(["Are we still on for Friday?"])
    expect(older.history).toMatchObject({ has_more: false, before_time: null })
    const recent = answerOf(await run("context", "telegram:101", "--since-time", "2026-09-10T08:30:00Z", "--json"))
    expect(recent.history.items.map(({ text }: { text: string }) => text)).toEqual(["Yes, see you then."])
    vi.stubEnv("TZ", "Europe/Madrid")
    expect(await run("context", "telegram:101", "--limit", "1")).toMatch(
      /^Rin Example {2}person:\d+\n.*\n {2}times in Europe\/Madrid\n\nHistory\n {2}2026-09-10 11:00 {2}message {2}Rin Example: Yes, see you then\. .*\n {2}older — wcat context person:\d+ --before-time 2026-09-10T08:59:59\.999Z\n/s,
    )
  })

  it("reads a person with two identities seen by one account through that account", async () => {
    const store = await openStore({ env })
    await store.sync.applyDelta(tg, { people: [{ id: "102", name: "Rin Example" }] })
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "telegram", id: "102" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    await store.close()

    const answer = answerOf(await run("context", `person:${uid}`, "--source", "telegram:1", "--json"))

    expect(answer.messages.person.uid).toBe(uid)
  })

  it("says which sources gave nothing, and why", async () => {
    const answer = answerOf(await run("context", "telegram:101", "--json"))

    expect(answer.not_read.map(({ source }: { source: string }) => source)).toEqual(["notes", "mail", "events"])
  })

  it("lists the calendar events of a linked email, from every calendar, with the invitation's words marked untrusted", async () => {
    const store = await openStore({ env })
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "email", id: "rin@example.test" },
      { method: "manual", by: "owner" },
    )
    await store.accounts.registerProvider({
      name: "google-calendar",
      kind: "events",
      aliases: ["gcal"],
      command: "gcal",
    })
    const rin = [{ email: "rin@example.test", name: "Rin Example" }]
    const entry = (externalId: string, title: string, startsAt: number) => ({
      externalId,
      kind: "single" as const,
      status: "confirmed" as const,
      title,
      location: "Room 4",
      startsAt,
      endsAt: startsAt + 3_600_000,
      participants: rin,
    })
    for (const [account, events] of [
      ["work@example.test", [entry("e1", "Lighthouse review", Date.UTC(2099, 0, 5, 9))]],
      ["home@example.test", [entry("e2", "Budget call", Date.UTC(2001, 0, 5, 9))]],
    ] as const) {
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
      await store.calendar.saveEntries(calendar?.id as number, [...events], 1)
    }
    await store.close()

    const answer = answerOf(await run("context", "telegram:101", "--json"))

    expect(answer.events.upcoming.map(({ title }: { title: string }) => title)).toEqual(["Lighthouse review"])
    expect(answer.events.recent.map(({ title }: { title: string }) => title)).toEqual(["Budget call"])
    expect(answer.events.upcoming[0].ref).toMatch(/^event:\d+$/)
    expect(answer.events.accounts.sort()).toEqual([
      "google-calendar:home@example.test",
      "google-calendar:work@example.test",
    ])
    expect(answer.messages.events).toBeUndefined()
    expect(answer.untrusted).toEqual(expect.arrayContaining(["events.upcoming.title", "events.recent.location"]))
    expect(answer.not_read.map(({ source }: { source: string }) => source)).not.toContain("events")

    const text = await run("context", "telegram:101")
    expect(text).toContain("Upcoming events")
    expect(text).toMatch(/2099-01-05 09:00 {2}Lighthouse review {2}Room 4 {2}event:\d+/)
    expect(text).toContain("Recent events")
  })

  it("prints a readable answer, naming the person, each message and each note by a reference wcat takes", async () => {
    const added = await addNote(env, "Prefers mornings", { subject: ["telegram:101"] })
    const text = await run("context", "telegram:101")

    expect(text).toContain("Last from them")
    expect(text).toContain("Are we still on for Friday?")
    expect(text.split("\n")[0]).toMatch(/ {2}person:\d+$/)
    expect(text).toMatch(/Are we still on for Friday\? {2}msg:telegram\/1\/101\/1/)
    expect(text).toContain(`  ${added.ref}  Prefers mornings`)
  })

  it("lists files Google reports they own, and leaves out unreviewed links a program guessed", async () => {
    const store = await openStore({ env })
    const drive = { provider: "google-drive", account: "u1" }
    const folder = await store.notes.documentsAccount(drive, true)
    if (folder === undefined) throw new Error("no documents account")
    await store.catalog.upsert(folder.id, [
      {
        externalId: "f1.md",
        kind: "file",
        name: "Lighthouse budget",
        parents: ["d1.md"],
        url: "https://docs.google.com/document/d/f1/edit",
        modifiedAt: "2026-10-01T10:00:00Z",
      },
      { externalId: "f2.md", kind: "file", name: "Guessed file", parents: [] },
      { externalId: "d1.md", kind: "folder", name: "Clients", parents: [] },
    ])
    await store.accounts.saveAccount(drive, { name: "Google Drive" })
    await store.people.savePeople(drive, [{ id: "g1", name: "Rin Example" }])
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "google-drive", id: "g1" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    const documentOf = async (id: string) => (await store.catalog.get(folder.id, id))?.ref.split(":")[1] as string
    await store.notes.replaceFileLinks(await documentOf("f1.md"), [
      {
        kind: "related-to",
        to: `person:${uid}`,
        role: "owner",
        provenance: "google-drive:files.get",
        confirmed: false,
      },
    ])
    await store.notes.replaceFileLinks(await documentOf("f2.md"), [
      { kind: "related-to", to: `person:${uid}`, provenance: "scan", confirmed: false },
    ])
    await store.close()

    const answer = answerOf(await run("context", "telegram:101", "--json"))
    const text = await run("context", "telegram:101")

    expect(answer.files).toEqual([
      expect.objectContaining({
        title: "Lighthouse budget",
        role: "owner",
        url: "https://docs.google.com/document/d/f1/edit",
        modified_at: "2026-10-01T10:00:00Z",
        confirmed: false,
      }),
    ])
    expect(answer.relationships).toEqual([])
    expect(text).toContain("Files, as their source reports")
    expect(text).toMatch(
      /owner {2}Lighthouse budget {2}2026-10-01 10:00 {2}https:\/\/docs\.google\.com\/document\/d\/f1\/edit/,
    )
    expect(text).not.toContain("Guessed file")

    const [reported] = answerOf(await run("relationships", "list", "standing:reported", "--json")).items
    expect(reported.from_document).toEqual({
      ref: reported.from,
      title: "Lighthouse budget",
      path: "Clients/Lighthouse budget",
      url: "https://docs.google.com/document/d/f1/edit",
      modified_at: "2026-10-01T10:00:00Z",
      mime: null,
    })
  })

  it("lists only the files of the accounts --source names", async () => {
    const store = await openStore({ env })
    const drive = { provider: "google-drive", account: "u1" }
    await store.accounts.saveAccount(drive, { name: "Google Drive" })
    await store.people.savePeople(drive, [{ id: "g1", name: "Rin Example" }])
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "google-drive", id: "g1" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    for (const account of ["u1", "u2"]) {
      const folder = await store.notes.documentsAccount({ provider: "google-drive", account }, true)
      if (folder === undefined) throw new Error("no documents account")
      await store.catalog.upsert(folder.id, [
        { externalId: "f.md", kind: "file", name: `File of ${account}`, parents: [] },
      ])
      const document = (await store.catalog.get(folder.id, "f.md"))?.ref.split(":")[1] as string
      await store.notes.replaceFileLinks(document, [
        {
          kind: "related-to",
          to: `person:${uid}`,
          role: "owner",
          provenance: "google-drive:files.get",
          confirmed: false,
        },
      ])
    }
    await store.close()

    const all = answerOf(await run("context", `person:${uid}`, "--json"))
    expect(all.files.map((file: { title: string }) => file.title).sort()).toEqual(["File of u1", "File of u2"])
    const scoped = answerOf(await run("context", `person:${uid}`, "--source", "telegram:1,google-drive:u1", "--json"))
    expect(scoped.files.map((file: { title: string }) => file.title)).toEqual(["File of u1"])
  })

  it("lists a Notion page they last edited, as any documents source reports it", async () => {
    const store = await openStore({ env })
    const notion = { provider: "notion", account: "w1:b1" }
    await store.accounts.registerProvider({ name: "notion", kind: "documents", aliases: [] })
    const folder = await store.notes.documentsAccount(notion, true)
    if (folder === undefined) throw new Error("no documents account")
    await store.catalog.upsert(folder.id, [
      { externalId: "p1.md", kind: "file", name: "Lighthouse roadmap", parents: [], url: "https://www.notion.so/p1" },
    ])
    await store.accounts.saveAccount(notion, { name: "Notion" })
    await store.people.savePeople(notion, [{ id: "n1", name: "Rin Example" }])
    await store.people.linkIdentities(
      { provider: "telegram", id: "101" },
      { provider: "notion", id: "n1" },
      { method: "manual", by: "owner" },
    )
    const uid = (await store.people.personOf({ provider: "telegram", id: "101" }))?.uid as string
    const page = (await store.catalog.get(folder.id, "p1.md"))?.ref.split(":")[1] as string
    await store.notes.replaceFileLinks(page, [
      {
        kind: "related-to",
        to: `person:${uid}`,
        role: "last-editor",
        provenance: "notion:pages.retrieve",
        confirmed: false,
      },
    ])
    await store.close()

    const answer = answerOf(await run("context", "telegram:101", "--json"))
    expect(answer.files).toEqual([
      expect.objectContaining({
        title: "Lighthouse roadmap",
        role: "last-editor",
        url: "https://www.notion.so/p1",
        provenance: "notion:pages.retrieve",
      }),
    ])
    expect(answer.relationships).toEqual([])
  })

  it("asks for the messenger, and names a messenger the store does not hold", async () => {
    await expect(run("context", "Rin Example")).rejects.toThrow("names no messenger")
    await expect(run("context", "max:Rin")).rejects.toThrow("no max account")
  })
})
