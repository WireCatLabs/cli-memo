import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Chat, Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
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
let vault: string

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("")
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "context-"))
  vault = join(dir, "vault")
  mkdirSync(join(vault, "People"), { recursive: true })
  writeFileSync(join(vault, "People", "Rin Example.md"), "Works on the lighthouse.\n")
  writeFileSync(join(vault, "Meeting.md"), "Kickoff.\n[[Rin Example]] will send the budget.\n")
  writeFileSync(join(vault, "Call.md"), "Called [[person:PLACEHOLDER]] about Friday.\nRin Example sounded busy.\n")
  env = {
    ...process.env,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_CONFIG_DIR: join(dir, "config"),
    MEMO_STATE_DIR: join(dir, "state"),
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

describe("memo context", () => {
  it("finds direct messages in a private dialog without recorded members", async () => {
    const store = await openStore({ env })
    await store.roster.saveMembers(tg, "101", [])
    await store.close()

    const answer = answerOf(await run("context", "telegram:101", "--json"))

    expect(answer.messages.last.from_them?.id).toBe("1")
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
    writeFileSync(join(vault, "Call.md"), `Called [[person:${uid}]] about Friday.\nRin Example sounded busy.\n`)
    await run("folders", "add", vault)
    await run("sync", "--only", "notes")
    await run("notes", "links", "add", "telegram:101", join(vault, "People", "Rin Example.md"))
    await run("notes", "add", "Prefers mornings", "--subject", "email:rin@example.test")

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

  it("takes a person reference, and asks for an account when several saw the person", async () => {
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

    await expect(run("context", `person:${uid}`, "--json")).rejects.toThrow(/seen by 2 accounts.*--source/)
    const answer = answerOf(await run("context", `person:${uid}`, "--source", "telegram:1", "--json"))

    expect(answer.messages.person.uid).toBe(uid)
    expect(answer.messages.last.from_them.text).toBe("Are we still on for Friday?")
    await expect(run("context", "person:99999", "--json")).rejects.toThrow(/no person:99999/)
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

  it("prints a readable answer, naming the person, each message and each note by a reference memo takes", async () => {
    const added = answerOf(await run("notes", "add", "Prefers mornings", "--subject", "telegram:101", "--json"))
    const text = await run("context", "telegram:101")

    expect(text).toContain("Last from them")
    expect(text).toContain("Are we still on for Friday?")
    expect(text.split("\n")[0]).toMatch(/ {2}person:\d+$/)
    expect(text).toMatch(/Are we still on for Friday\? {2}msg:telegram\/1\/101\/1/)
    expect(text).toContain(`  ${added.ref}  Prefers mornings`)

    const listed = await run("notes", "list", "source:internal")
    expect(listed).toContain(`${added.ref}  internal`)
    const shown = (await run("notes", "show", added.ref)).split("\n")
    expect(shown[0]).toBe(added.ref)
    expect(shown).toContain("Prefers mornings")
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
        parents: [],
        url: "https://docs.google.com/document/d/f1/edit",
        modifiedAt: "2026-10-01T10:00:00Z",
      },
      { externalId: "f2.md", kind: "file", name: "Guessed file", parents: [] },
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
    expect(text).toContain("Files, as Google reports")
    expect(text).toMatch(
      /owner {2}Lighthouse budget {2}2026-10-01 10:00 {2}https:\/\/docs\.google\.com\/document\/d\/f1\/edit/,
    )
    expect(text).not.toContain("Guessed file")
  })

  it("asks for the messenger, and names a messenger the store does not hold", async () => {
    await expect(run("context", "Rin Example")).rejects.toThrow("names no messenger")
    await expect(run("context", "max:Rin")).rejects.toThrow("no max account")
  })
})
