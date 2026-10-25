import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { callCommand } from "../../test/mcp.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const telegram = { provider: "telegram", account: "1" }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const message = (id: string, text: string, timestamp: string) => ({
  id,
  chatId: "7",
  senderId: "9",
  senderName: null,
  timestamp,
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const setUp = async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-gather-")), "s.db") }
  const store = await openStore({ env })
  await store.messages.saveMessages(
    telegram,
    "7",
    [
      message("1", "Harbour budget agreed", daysAgo(3)),
      message("2", "Crane tender opens for the harbour", daysAgo(2)),
      message("3", "Lunch with Alice Example", daysAgo(1)),
      message("4", "Harbour kickoff long ago", daysAgo(200)),
    ],
    { via: "test" },
  )
  const project = await store.knowledge.addProject({ name: "Synthetic Port", key: "SYP" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Harbour")
  await store.knowledge.addProject({ name: "Crane" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { env, run, json: async (...args: string[]) => answerOf(await run(...args, "--json")) }
}

it("gathers a project's references by its aliases, keywords and people within 60 days of one account", async () => {
  const { json, run } = await setUp()
  const found = await json(
    "projects",
    "evidence",
    "SYP",
    "--source",
    "telegram:1",
    "--context-query",
    "crane tender",
    "--contact",
    "Alice Example",
  )
  expect(found).toMatchObject({ project_ref: "project:1", scope: { origin: "explicit" }, completeness: "unknown" })
  expect(found.lanes.map((lane: { query: string }) => lane.query)).toEqual([
    "Synthetic Port",
    "SYP",
    "Harbour",
    "crane tender",
    "Alice Example",
  ])
  const byRef = Object.fromEntries(found.items.map((item: { ref: string }) => [item.ref, item]))
  expect(Object.keys(byRef).sort()).toEqual(["msg:telegram/1/7/1", "msg:telegram/1/7/2", "msg:telegram/1/7/3"])
  expect(byRef["msg:telegram/1/7/2"]).toMatchObject({ lanes: ["l3", "l4"], context: "project", time_kind: "sent" })
  expect(byRef["msg:telegram/1/7/3"]).toMatchObject({ context: "person-only" })
  expect(found.checkpoint).toBeNull()
  expect(found.mentions).toMatchObject({ association: "unconfirmed-literal-evidence" })
  expect(found.mentions.items.map((one: { target: { name: string } }) => one.target.name)).toEqual(["Crane"])
  expect(found.mentions.items[0].matches[0]).toMatchObject({ reference: "msg:telegram/1/7/2", in: "hit" })

  expect(
    byRef["msg:telegram/1/7/1"].around.map((one: { ref: string; found: boolean }) => [one.ref, one.found]),
  ).toEqual([
    ["msg:telegram/1/7/4", false],
    ["msg:telegram/1/7/2", true],
    ["msg:telegram/1/7/3", true],
  ])
  const quiet = await json("projects", "evidence", "SYP", "--source", "telegram:1", "--before-n", "0", "--after-n", "0")
  expect(quiet.items.every((item: { around?: unknown }) => item.around === undefined)).toBe(true)
  const text = await run("projects", "evidence", "SYP", "--source", "telegram:1", "--since-time", "365d")
  expect(text).toContain("msg:telegram/1/7/4")
  expect(text).toContain("a finished search does not prove there is nothing more")
  expect(text).toContain("also names: project Crane (3) — words found, not membership")
  const since = await json(
    "projects",
    "evidence",
    "SYP",
    "--source",
    "telegram:1",
    "--since-time",
    daysAgo(250).slice(0, 10),
  )
  expect(since.window).toMatchObject({ basis: "explicit", lookback_days: null })
  expect(since.items.map((item: { ref: string }) => item.ref)).toContain("msg:telegram/1/7/4")
  await expect(
    json("projects", "evidence", "SYP", "--source", "telegram:1", "--since-time", "soon"),
  ).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("resolves a project by id and reads a mailbox and an imported notes folder as their own source kinds", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  const mailId = await store.accounts.saveAccount({ provider: "email", account: "me@example.com" }, { name: "Me" })
  await store.mail.saveThread({
    accountId: mailId,
    externalId: "t1",
    now: 1,
    emails: [
      {
        externalId: "m1",
        subject: "Harbour offer",
        from: { address: "port@example.com", name: null },
        to: [{ address: "me@example.com", name: null }],
        cc: [],
        sentAt: Date.parse(daysAgo(4)),
        receivedAt: Date.parse(daysAgo(4)),
        references: [],
        bodyText: "Harbour offer attached",
        outgoing: false,
        read: true,
        mailboxes: [{ externalId: "INBOX", name: "INBOX", kind: null }],
      },
    ],
  })
  const folder = await store.notes.addFolder({ name: "Synthetic folder" })
  await store.notes.saveFileNote({ folderId: folder.id, path: "port.md", title: "Harbour", text: "Harbour notes" })
  await store.close()

  const asIs = await run("projects", "evidence", "SYP", "--source", `email:me@example.com`, "--no-catch-up")
  expect(asIs).toContain("not yet searchable: new text in email:me@example.com")
  expect(asIs).toContain("leave out --no-catch-up")
  const indexed = await json("projects", "evidence", "SYP", "--source", `email:me@example.com`, "--alias", "offer")
  expect(indexed.index).toMatchObject({ state: "updated" })
  expect(indexed.lanes.map((lane: { query: string; kinds: string[] }) => `${lane.query}:${lane.kinds}`)).toEqual([
    "Synthetic Port:project",
    "SYP:key",
    "Harbour:alias",
    "offer:alias",
  ])
  expect(indexed.items.map((item: { ref: string }) => item.ref)).toEqual(["msg:email/me%40example.com/t1/m1"])
  for (const reference of ["project:1", "1"]) {
    const found = await json("projects", "evidence", reference, "--source", `email:me@example.com,notes:${folder.id}`)
    expect(found.project_ref).toBe("project:1")
    expect(found.lanes.map((lane: { query: string }) => lane.query)).toEqual(["Synthetic Port", "SYP", "Harbour"])
    expect(found.scope.sources).toEqual([
      { kind: "mail", account_id: mailId, provider: "email", account: "me@example.com" },
      expect.objectContaining({ kind: "document", account_id: Number(folder.id), provider: "obsidian" }),
    ])
    expect(found.units.every((unit: { state: string }) => unit.state === "done")).toBe(true)
  }
  await expect(json("projects", "evidence", "project:9", "--source", "telegram:1")).rejects.toMatchObject({
    code: "not_found",
  })
})

it("stops at the read budget and continues from the checkpoint without repeating references", async () => {
  const { json } = await setUp()
  const args = ["projects", "evidence", "Harbour", "--source", "telegram:1", "--context-query", "crane tender"]
  const first = await json(...args, "--max-pages", "1")
  expect(first).toMatchObject({ stopped: "reads", complete: false })
  const capped = await json(...args, "--limit", "1")
  expect(capped).toMatchObject({ stopped: "items", complete: false })
  const second = await json(...args, "--cursor", first.checkpoint)
  expect(second).toMatchObject({ resumed: true, complete: true })
  const seen = new Set(first.items.map((item: { ref: string }) => item.ref))
  expect(second.items.every((item: { ref: string }) => !seen.has(item.ref))).toBe(true)
  await expect(
    json("projects", "evidence", "Harbour", "--source", "telegram:1", "--cursor", first.checkpoint),
  ).rejects.toMatchObject({
    code: "validation_error",
  })
})

it("over MCP needs a source, refuses unknown arguments and reports what all leaves unread", async () => {
  const { env } = await setUp()
  const [server, transport] = InMemoryTransport.createLinkedPair()
  await createMemoServer(env, createProgram).connect(server)
  const client = new Client({ name: "synthetic", version: "1" })
  await client.connect(transport)
  const missing = await callCommand(client, { name: "projects evidence", arguments: { project: "SYP" } })
  expect(missing.isError).toBe(true)
  const unknown = await callCommand(client, {
    name: "projects evidence",
    arguments: { project: "SYP", source: "all", keywords: ["crane"] },
  })
  expect(unknown.isError).toBe(true)
  const all = await callCommand(client, {
    name: "projects evidence",
    arguments: {
      project: "SYP",
      source: "all",
      context_query: ["crane tender"],
      contact: ["Alice Example"],
      since_time: "30d",
      no_catch_up: true,
      before_n: 1,
      after_n: 0,
    },
  })
  expect(all.isError, JSON.stringify(all.structuredContent)).toBeFalsy()
  const item = (all.structuredContent as { item: Record<string, unknown> }).item
  expect(item).toMatchObject({
    scope: { origin: "all-connected" },
    window: { lookback_days: 30 },
    index: { state: "as-is" },
  })
  expect((item.lanes as { query: string }[]).map((lane) => lane.query)).toEqual([
    "Synthetic Port",
    "SYP",
    "Harbour",
    "crane tender",
    "Alice Example",
  ])
  expect(item.unread_sources).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "notes" })]))
  await client.close()
})

it("lists a document too large to read by reference and gives a read one the paragraphs around its hit", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  const folder = await store.notes.addFolder({ name: "Synthetic folder" })
  const { note: huge } = await store.notes.saveFileNote({
    folderId: folder.id,
    path: "huge.md",
    title: "Huge",
    text: `Harbour archive ${"x".repeat(300000)}`,
  })
  await store.notes.saveFileNote({
    folderId: folder.id,
    path: "plan.md",
    title: "Plan",
    text: "Scope.\n\nThe harbour crane arrives in May.\n\nOwners: Alice Example.",
  })
  await store.close()
  const text = await run("projects", "evidence", "SYP", "--source", `notes:${folder.id}`)
  expect(text).toContain(`too large to read here: document:${huge.id} (`)
  expect(text).toContain("(hit) The harbour crane arrives in May.")
  expect(text).toContain("Owners: Alice Example.")
  const found = await json("projects", "evidence", "SYP", "--source", `notes:${folder.id}`)
  expect(found.oversized).toEqual([{ ref: `document:${huge.id}`, lanes: ["l3"], source: 0, bytes: expect.any(Number) }])
})

it("reads what --contact person:<id> wrote though no text spells their display name, and searches the owner's alias", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  await store.people.savePeople(telegram, [{ id: "55", name: "Степа Stefan Grachev AVITO M A" }])
  await store.messages.saveMessages(
    telegram,
    "8",
    [{ ...message("1", "Booked it for Tuesday", daysAgo(1)), chatId: "8", senderId: "55" }],
    { via: "test" },
  )
  await store.messages.saveMessages(telegram, "7", [message("5", "Ask Степа about the dates", daysAgo(1))], {
    via: "test",
  })
  await store.people.setContactAlias(telegram, "55", "Степа")
  const uid = (await store.people.personOf({ provider: "telegram", id: "55" }))?.uid as string
  await store.close()
  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1", "--contact", `person:${uid}`)
  expect(found.lanes.slice(3)).toEqual([
    { id: "l4", kinds: ["person"], query: "Степа", people: [`person:${uid}`] },
    {
      id: "l5",
      kinds: ["sender"],
      query: null,
      people: [`person:${uid}`],
      senders: [{ provider: "telegram", id: "55" }],
    },
  ])
  const byRef = Object.fromEntries(found.items.map((item: { ref: string }) => [item.ref, item]))
  expect(byRef["msg:telegram/1/8/1"]).toMatchObject({ context: "sender", lanes: ["l5"] })
  expect(byRef["msg:telegram/1/7/5"]).toMatchObject({ context: "person-only", lanes: ["l4"] })
  const text = await run("projects", "evidence", "SYP", "--source", "telegram:1", "--contact", `person:${uid}`)
  expect(text).toContain("msg:telegram/1/8/1  [sent by contact]")
  expect(text).toContain(`what person:${uid} wrote (sender)`)
  await expect(
    run("projects", "evidence", "SYP", "--source", "telegram:1", "--contact", "person:NOSUCHPERSON"),
  ).rejects.toMatchObject({ code: "not_found", details: { param: "contact" } })
})

it("reads a project's confirmed linked chats whole, never a suggested one or one outside --source", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  const inChat = (chatId: string, id: string, text: string) => ({ ...message(id, text, daysAgo(4)), chatId })
  await store.messages.saveMessages(telegram, "8", [inChat("8", "1", "Weather is fine today")], { via: "test" })
  await store.messages.saveMessages(telegram, "6", [inChat("6", "1", "Nothing to see")], { via: "test" })
  const other = { provider: "telegram", account: "2" }
  await store.messages.saveMessages(other, "5", [inChat("5", "1", "Quiet room")], { via: "test" })
  await store.knowledge.relate(null, {
    from: "chat:telegram/1/6",
    to: "project:1",
    kind: "member-of",
    confirmed: false,
    provenance: "agent:test",
  })
  await store.close()

  const added = await json("relationships", "add", "chat:telegram/1/8", "project:1", "--as-owner")
  expect(added).toMatchObject({ from: "chat:telegram/1/8", to: "project:1", kind: "member-of", confirmed: true })
  await json("relationships", "add", "chat:telegram/2/5", "project:1", "--as-owner")
  await expect(
    run("relationships", "add", "chat:telegram/1/8", "project:1", "--kind", "related-to", "--as-owner"),
  ).rejects.toMatchObject({ code: "validation_error" })

  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1")
  const lane = found.lanes.find((one: { kinds: string[] }) => one.kinds.includes("linked-chat"))
  expect(lane).toMatchObject({ query: null, chat: "chat:telegram/1/8" })
  expect(found.items.find((item: { ref: string }) => item.ref === "msg:telegram/1/8/1")).toMatchObject({
    context: "linked-chat",
    lanes: [lane.id],
  })
  expect(found.items.some((item: { ref: string }) => item.ref.startsWith("msg:telegram/1/6/"))).toBe(false)
  expect(found.linked_chats).toEqual([
    expect.objectContaining({ ref: "chat:telegram/1/8", state: "in-scope" }),
    expect.objectContaining({ ref: "chat:telegram/2/5", state: "out-of-scope", lane: null }),
  ])
  expect(found.unread_sources).toEqual([{ source: "chat:telegram/2/5", kind: "linked-chat", reason: "out-of-scope" }])
  const text = await run("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(text).toContain("msg:telegram/1/8/1  [linked chat]")
  expect(text).toContain("not read: chat:telegram/2/5 (linked-chat, out-of-scope)")
})

it("leaves the rest of a busy linked chat to --cursor and says which chat it capped", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  const busy = Array.from({ length: 60 }, (_, n) => ({ ...message(`${n + 1}`, `Line ${n}`, daysAgo(4)), chatId: "8" }))
  await store.messages.saveMessages(telegram, "8", busy, { via: "test" })
  await store.close()
  await json("relationships", "add", "chat:telegram/1/8", "project:1", "--as-owner")

  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(found.linked_chats).toEqual([expect.objectContaining({ ref: "chat:telegram/1/8", items: 50, capped: true })])
  expect(found.checkpoint).toEqual(expect.any(String))
  const text = await run("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(text).toContain(
    "linked chats with more to read, left for --cursor so one chat does not fill the run: chat:telegram/1/8 (50 this run)",
  )
})

it("reads linked chats when the project also has a confirmed meeting link", async () => {
  const { env, json } = await setUp()
  const store = await openStore({ env })
  const inChat = { ...message("1", "Weather is fine today", daysAgo(4)), chatId: "8" }
  await store.messages.saveMessages(telegram, "8", [inChat], { via: "test" })
  const key = { provider: "zoom", account: "ExampleCalendar" }
  const input = sampleMeeting()
  input.meeting.accountId = await store.accounts.saveAccount(key, { name: "ExampleCalendar" })
  const saved = await store.meetings.saveMeeting(input)
  await store.knowledge.linkMeetingProject(key, String(saved.meeting.id), "1", { by: "owner" })
  await store.close()
  await json("relationships", "add", "chat:telegram/1/8", "project:1", "--as-owner")

  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(found.linked_chats).toEqual([expect.objectContaining({ ref: "chat:telegram/1/8", state: "in-scope" })])
})

it("counts who wrote the evidence by stored contact across messengers, leaving out the owner", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  const max = { provider: "max", account: "2" }
  await store.people.savePeople(telegram, [
    { id: "55", name: "Stefan" },
    { id: "66", name: "Bob" },
  ])
  await store.people.savePeople(max, [{ id: "m55", name: "Степа" }])
  await store.messages.saveMessages(
    telegram,
    "8",
    [
      { ...message("1", "Harbour crane booked", daysAgo(1)), chatId: "8", senderId: "55" },
      { ...message("2", "Harbour lunch", daysAgo(1)), chatId: "8", senderId: "66" },
      { ...message("3", "Harbour from me", daysAgo(1)), chatId: "8", senderId: "1", outgoing: true },
    ],
    { via: "test" },
  )
  await store.messages.saveMessages(
    max,
    "9",
    [{ ...message("1", "Harbour dates moved", daysAgo(1)), chatId: "9", senderId: "m55" }],
    { via: "test" },
  )
  const stepa = await store.people.linkIdentities(
    { provider: "telegram", id: "55" },
    { provider: "max", id: "m55" },
    { method: "manual", by: "owner" },
  )
  await store.close()

  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1,max:2")
  expect(found.people).toContainEqual({
    person: `person:${stepa.uid}`,
    name: stepa.name,
    identities: [
      { provider: "telegram", account: "1", id: "55" },
      { provider: "max", account: "2", id: "m55" },
    ],
    items: 2,
    contexts: { project: 2 },
  })
  expect(found.people).toContainEqual(expect.objectContaining({ name: "Bob", items: 1 }))
  expect(found.people.some((one: { identities: { id: string }[] }) => one.identities.some((i) => i.id === "1"))).toBe(
    false,
  )
  expect(found.people_omitted).toBe(0)
  const text = await run("projects", "evidence", "SYP", "--source", "telegram:1,max:2")
  expect(text).toMatch(/people who wrote these: .*Bob \(1\)/)
})

it("reads a project's confirmed person members by sender, never a suggested one, and not twice with --contact", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  await store.people.savePeople(telegram, [
    { id: "55", name: "Stefan" },
    { id: "66", name: "Bob" },
  ])
  await store.messages.saveMessages(
    telegram,
    "8",
    [
      { ...message("1", "Booked it for Tuesday", daysAgo(1)), chatId: "8", senderId: "55" },
      { ...message("2", "Nothing about work", daysAgo(1)), chatId: "8", senderId: "66" },
    ],
    { via: "test" },
  )
  const stefan = (await store.people.personOf({ provider: "telegram", id: "55" }))?.uid as string
  const bob = (await store.people.personOf({ provider: "telegram", id: "66" }))?.uid as string
  const member = (from: string, confirmed: boolean) =>
    store.knowledge.relate(null, { from, to: "project:1", kind: "member-of", confirmed, provenance: "agent:test" })
  await member(`person:${stefan}`, true)
  await member(`person:${bob}`, false)
  await store.close()

  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(found.lanes.filter((lane: { kinds: string[] }) => lane.kinds.includes("sender"))).toEqual([
    expect.objectContaining({ people: [`person:${stefan}`], senders: [{ provider: "telegram", id: "55" }] }),
  ])
  expect(found.items.find((item: { ref: string }) => item.ref === "msg:telegram/1/8/1")).toMatchObject({
    context: "sender",
  })
  expect(found.items.some((item: { ref: string }) => item.ref === "msg:telegram/1/8/2")).toBe(false)
  expect(found.people).toContainEqual(expect.objectContaining({ person: `person:${stefan}`, items: 1 }))
  expect(found.people.some((one: { person: string }) => one.person === `person:${bob}`)).toBe(false)

  const again = await json("projects", "evidence", "SYP", "--source", "telegram:1", "--contact", `person:${stefan}`)
  expect(again.lanes.filter((lane: { kinds: string[] }) => lane.kinds.includes("sender"))).toHaveLength(1)
  expect(again.items.filter((item: { ref: string }) => item.ref === "msg:telegram/1/8/1")).toHaveLength(1)
  expect(await run("projects", "evidence", "SYP", "--source", "telegram:1")).toContain("[sent by contact]")
})

it("says which members it left out when the lane limit is reached", async () => {
  const { env, json, run } = await setUp()
  const store = await openStore({ env })
  const uids: string[] = []
  for (let n = 0; n < 16; n++) {
    await store.people.savePeople(telegram, [{ id: `${100 + n}`, name: `Member ${n}` }])
    uids.push((await store.people.personOf({ provider: "telegram", id: `${100 + n}` }))?.uid as string)
  }
  for (const uid of uids)
    await store.knowledge.relate(null, {
      from: `person:${uid}`,
      to: "project:1",
      kind: "member-of",
      confirmed: true,
      provenance: "agent:test",
    })
  await store.close()

  const found = await json("projects", "evidence", "SYP", "--source", "telegram:1")
  const read = found.lanes.filter((lane: { kinds: string[] }) => lane.kinds.includes("sender"))
  const left = found.unread_sources.filter((one: { kind: string }) => one.kind === "member")
  expect(read).toHaveLength(13)
  expect(left.map((one: { reason: string }) => one.reason)).toEqual(["member-limit", "member-limit", "member-limit"])
  const sorted = uids.map((uid) => `person:${uid}`).sort()
  expect(read.map((lane: { people: string[] }) => lane.people[0])).toEqual(sorted.slice(0, 13))
  expect(left.map((one: { source: string }) => one.source)).toEqual(sorted.slice(13))
  expect(await run("projects", "evidence", "SYP", "--source", "telegram:1")).toContain(
    `${sorted[13]} (member, member-limit)`,
  )
})
