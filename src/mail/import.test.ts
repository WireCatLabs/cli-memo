import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, describe, expect, it } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import { applyRules } from "./apply.js"
import { decodeMailboxName, labelName } from "./gmail.js"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import { mboxSource } from "./mbox.js"
import type { MailRule } from "./rules.js"
import { himalayaSource } from "./source.js"
import { mailStatus, statusText } from "./status.js"

const ME = "owner@example.test"
const KEY = { provider: "email", account: ME }
const NOW = Date.parse("2026-10-04T12:00:00Z")
const SINCE = new Date("2026-09-01T00:00:00Z")

interface Fixture {
  labels?: string[]
  flags?: string[]
  uid: string
  messageId: string
  threadId: string
  receivedAt: string
  subject: string
  from: [string | null, string]
  to: [string | null, string][]
  cc?: [string | null, string][]
  text?: string
  html?: string
  listId?: string
}

const mail = (n: number, overrides: Partial<Fixture> = {}): Fixture => ({
  uid: String(100 + n),
  messageId: String(9000 + n),
  threadId: String(9000 + n),
  receivedAt: `2026-09-${String(10 + n).padStart(2, "0")}T08:00:00Z`,
  subject: `Synthetic subject ${n}`,
  from: ["Rin Example", "rin@example.test"],
  to: [[null, ME]],
  text: `Synthetic body ${n}`,
  ...overrides,
})

const opened: MessageStore[] = []

const setup = (messages: Fixture[], extra: Record<string, unknown> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "mail-"))
  const mailbox = join(dir, "mailbox.json")
  const write = (next: Fixture[], more: Record<string, unknown> = {}) =>
    writeFileSync(mailbox, JSON.stringify({ messages: next, ...extra, ...more }))
  write(messages)
  const env = { ...process.env, MEMO_FAKE_MAILBOX: mailbox, MESSAGING_STORE: join(dir, "messages.db") }
  return { dir, env, write }
}

const store = async (env: NodeJS.ProcessEnv) => {
  const opening = await openStore({ env })
  opened.push(opening)
  return opening
}

const importInto = async (env: NodeJS.ProcessEnv, max?: number) =>
  importMail({
    store: await store(env),
    source: himalayaSource(himalaya(env), { name: "test" }),
    account: { name: "test", address: ME },
    since: SINCE,
    now: () => NOW,
    indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    ...(max === undefined ? {} : { max }),
  })

const emails = async (env: NodeJS.ProcessEnv) => {
  const opening = await store(env)
  return opening.mail.emails({ accountId: (await opening.storedAccount(KEY)).id })
}

afterEach(async () => {
  for (const each of opened.splice(0)) await each.close()
})

describe("importMail", () => {
  it("saves each mail as an email of its Gmail thread, with sender, recipients and body", async () => {
    const { env } = setup([
      mail(1),
      mail(2, {
        threadId: "9001",
        from: [null, ME],
        to: [["Rin Example", "rin@example.test"]],
        subject: "Re: Synthetic subject 1",
      }),
    ])

    const result = await importInto(env)

    expect(result).toMatchObject({ listed: 2, saved: 2, alreadyStored: 0, deleted: 0, complete: true })
    const saved = await emails(env)
    expect(saved.map(({ externalId, outgoing, subject }) => ({ externalId, outgoing, subject }))).toEqual([
      { externalId: "9002", outgoing: true, subject: "Re: Synthetic subject 1" },
      { externalId: "9001", outgoing: false, subject: "Synthetic subject 1" },
    ])
    expect(saved[1]).toMatchObject({ bodyText: "Synthetic body 1", fromAddress: "rin@example.test" })
    expect(saved[1]?.mailboxes.map(({ externalId }) => externalId)).toEqual(["[Gmail]/All Mail"])
    const opening = await store(env)
    const [thread] = await opening.mail.threads({ accountId: (await opening.storedAccount(KEY)).id })
    expect(thread).toMatchObject({ externalId: "9001", subject: "Synthetic subject 1", emailsCount: 2 })
  })

  it("embeds new mail after saving it, when embedding is on", async () => {
    const { env } = setup([mail(1)])
    const asked: (boolean | undefined)[] = []
    const result = await importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME },
      since: SINCE,
      now: () => NOW,
      embed: true,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
      embedMail: async (_store, options) => {
        asked.push(options?.embed)
        return { chunks: 2, left: false }
      },
    })

    expect(asked).toEqual([true])
    expect(result.indexed).toMatchObject({ chunks: 2, left: false })
  })

  it("reads Gmail labels and flags into label mailboxes, replaces them each run, and deletes labelled mail", async () => {
    const labelled = mail(1, {
      labels: ["\\Inbox", "\\Important", '"Muy Importante"', "&BB8EQAQ4BDIENQRC-"],
      flags: ["\\Seen", "\\Flagged"],
    })
    const { env, write } = setup([labelled, mail(2), mail(3), mail(4), mail(5), mail(6)])
    await importInto(env)
    const boxes = async () =>
      (await emails(env))
        .find(({ externalId }) => externalId === "9001")
        ?.mailboxes.filter(({ kind }) => kind === "label")
        .map(({ name }) => name)
        .sort()
    expect(await boxes()).toEqual(["Important", "Inbox", "Muy Importante", "Starred", "Привет"])
    expect((await emails(env)).find(({ externalId }) => externalId === "9001")).toMatchObject({
      read: true,
      flagged: true,
    })

    write([{ ...labelled, labels: ["\\Inbox"], flags: [] }, mail(2), mail(3), mail(4), mail(5), mail(6)])
    await importInto(env)
    expect(await boxes()).toEqual(["Inbox"])

    write([mail(2), mail(3), mail(4), mail(5), mail(6)])
    expect((await importInto(env)).deleted).toBe(1)
  })

  it("keeps read and starred current on mail already stored", async () => {
    const first = mail(1, { labels: ["\\Inbox"], flags: [] })
    const { env, write } = setup([first])
    await importInto(env)
    expect((await emails(env))[0]).toMatchObject({ read: false, flagged: false })

    write([{ ...first, flags: ["\\Seen", "\\Flagged"] }])
    expect(await importInto(env)).toMatchObject({ saved: 0, alreadyStored: 1 })
    expect((await emails(env))[0]).toMatchObject({ read: true, flagged: true })
  })

  it("keeps a body up to the configured length", async () => {
    const { env } = setup([mail(1, { text: "x".repeat(50) })])
    await importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME },
      since: SINCE,
      now: () => NOW,
      maxBodyChars: 10,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })
    expect((await emails(env))[0]?.bodyText).toBe("x".repeat(10))
  })

  it("names labels as people read them", () => {
    expect(labelName("\\Important")).toBe("Important")
    expect(labelName("Important")).toBe("Important")
    expect(labelName("\\Sent")).toBe("Sent")
    expect(decodeMailboxName("&BB8EQAQ4BDIENQRC-")).toBe("Привет")
    expect(decodeMailboxName("Q&-A")).toBe("Q&A")
  })

  it("adds nothing when run again", async () => {
    const { env } = setup([mail(1), mail(2)])
    await importInto(env)

    expect(await importInto(env)).toMatchObject({ saved: 0, alreadyStored: 2, deleted: 0 })
  })

  it("saves the rest when one mail cannot be read, and reads that one next run", async () => {
    const { env, write } = setup([mail(1), mail(2), mail(3)], { unreadable: ["102"] })

    const first = await importInto(env)

    expect(first).toMatchObject({ saved: 2, complete: false, unreadable: [{ message: "9002" }] })
    write([mail(1), mail(2), mail(3)], { unreadable: [] })
    expect(await importInto(env)).toMatchObject({ saved: 1, alreadyStored: 2, complete: true })
  })

  it("keeps Cc addresses out of To", async () => {
    const { env } = setup([mail(1, { cc: [["Bob Sample", "bob@example.test"]] })])
    await importInto(env)

    const roles = (await emails(env))[0]?.recipients.map(({ address, role }) => `${role}:${address}`)
    expect(roles).toEqual([`to:${ME}`, "cc:bob@example.test"])
  })

  it("drops the text of a mail deleted at the source", async () => {
    const { env, write } = setup([mail(1), mail(2), mail(3), mail(4), mail(5), mail(6)])
    await importInto(env)
    write([mail(1), mail(2), mail(3), mail(4), mail(5)])

    expect(await importInto(env)).toMatchObject({ deleted: 1 })
    expect((await emails(env)).map(({ externalId }) => externalId)).not.toContain("9006")
  })

  it("saves a mail marked deleted again when the source lists it again", async () => {
    const all = [1, 2, 3, 4, 5, 6].map((n) => mail(n))
    const { env, write } = setup(all)
    await importInto(env)
    write(all.slice(0, 5))
    await importInto(env)
    write(all)

    expect(await importInto(env)).toMatchObject({ saved: 1, alreadyStored: 5, deleted: 0 })
    expect((await emails(env)).find(({ externalId }) => externalId === "9006")?.bodyText).toContain("Synthetic body 6")
  })

  it("leaves a stored mail at the window's edge alone", async () => {
    const edge = mail(1, { receivedAt: "2026-09-02T08:00:00Z" })
    const { env, write } = setup([edge, mail(2)])
    await importInto(env)
    write([mail(2)])

    expect(await importInto(env)).toMatchObject({ deleted: 0 })
  })

  it("deletes nothing when a large share is missing at the source", async () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mail(n))
    const { env, write } = setup(all)
    await importInto(env)
    write(all.slice(0, 2))

    const result = await importInto(env)

    expect(result.deleted).toBe(0)
    expect(result.deletionsSkipped).toContain("6 of 8")
  })

  it("deletes nothing and fails when the listing does not complete", async () => {
    const { env, write } = setup([mail(1), mail(2)])
    await importInto(env)
    write([], { searchFails: true })

    await expect(importInto(env)).rejects.toThrow("did not complete")
    expect(await emails(env)).toHaveLength(2)
  })

  it("reads at most max new mails, newest first, and continues on the next run", async () => {
    const { env } = setup([mail(1), mail(2), mail(3)])

    expect(await importInto(env, 2)).toMatchObject({ saved: 2, complete: false })
    expect(await importInto(env, 2)).toMatchObject({ saved: 1, alreadyStored: 2, complete: true })
  })

  it("keeps plain line ends", async () => {
    const { env } = setup([mail(1, { text: "line one\r\nline two" })])
    await importInto(env)

    expect((await emails(env))[0]?.bodyText).toBe("line one\nline two")
  })

  it("turns an HTML-only mail into text", async () => {
    const { env } = setup([
      mail(1, { text: undefined, html: "<style>p{}</style><p>Hello&nbsp;there</p><p>A &amp; B</p>" }),
    ])
    await importInto(env)

    expect((await emails(env))[0]?.bodyText).toBe("Hello there\nA & B")
  })
})

describe("importMail with the owner's rules", () => {
  const rules = [
    { match: { domain: "shop.example" }, action: "skip" as const, decided_at: "2026-10-14T00:00:00.000Z" },
    { match: { from: "orders@shop.example" }, action: "keep" as const, decided_at: "2026-10-14T00:00:00.000Z" },
  ]

  it("never reads or stores a new email a skip rule matches, and keeps what was stored before", async () => {
    const news = mail(2, { from: ["Shop", "news@shop.example"], listId: "news.shop.example" })
    const { env, write } = setup([mail(1), mail(3, { from: [null, "orders@shop.example"] })])
    await importInto(env)
    write([
      mail(1),
      news,
      mail(3, { from: [null, "orders@shop.example"] }),
      mail(4, { from: [null, "sale@shop.example"] }),
    ])

    const result = await importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, rules },
      since: SINCE,
      now: () => NOW,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })

    expect(result).toMatchObject({ listed: 4, saved: 0, alreadyStored: 2, skipped: 2, deleted: 0, complete: true })
    expect((await emails(env)).map(({ externalId }) => externalId).sort()).toEqual(["9001", "9003"])
  })

  const importRuled = async (env: NodeJS.ProcessEnv, ruled: MailRule[]) =>
    importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, rules: ruled },
      since: SINCE,
      now: () => NOW,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })
  const envelope = (match: MailRule["match"]): MailRule => ({
    match,
    action: "envelope",
    decided_at: "2026-10-14T00:00:00.000Z",
  })

  it("records an email an envelope rule matches without its text, out of search, under the rule's mailbox", async () => {
    const deal = mail(2, {
      from: ["Shop Deals", "deals@shop.example"],
      subject: "Unrepeatable bargain",
      text: "Unrepeatable bargain inside",
      listId: "deals.shop.example",
    })
    const { env } = setup([mail(1), deal])

    const result = await importRuled(env, [...rules, envelope({ list_id: "deals.shop.example" })])

    expect(result).toMatchObject({ listed: 2, saved: 1, skipped: 0, envelopes: 1, complete: true })
    expect((await emails(env)).find(({ externalId }) => externalId === "9001")?.size).toBeGreaterThan(0)
    const recorded = (await emails(env)).find(({ externalId }) => externalId === "9002")
    expect(recorded).toMatchObject({
      subject: null,
      bodyText: null,
      fromAddress: "deals@shop.example",
      fromName: "Shop Deals",
      metadata: {
        rule: { action: "envelope", match: { list_id: "deals.shop.example" } },
        subject: "Unrepeatable bargain",
        listId: "deals.shop.example",
      },
    })
    expect(recorded?.size).toBeGreaterThan(0)
    const opening = await store(env)
    expect(await opening.mail.search("Unrepeatable")).toEqual([])
    expect(
      await opening.mail.emailRefs({
        accountId: (await opening.storedAccount(KEY)).id,
        mailbox: "memo:envelope:list-id:deals.shop.example",
      }),
    ).toHaveLength(1)
    expect((await importRuled(env, [envelope({ list_id: "deals.shop.example" })])).envelopes).toBe(0)
  })

  it("reads an envelope email in full once its rule is removed, and leaves the rule's mailbox", async () => {
    const deal = mail(2, { from: [null, "deals@shop.example"], subject: "Second look", text: "Now wanted" })
    const { env } = setup([deal])
    await importRuled(env, [envelope({ domain: "shop.example" })])

    const result = await importRuled(env, [])

    expect(result).toMatchObject({ saved: 1, envelopes: 0, complete: true })
    const [read] = await emails(env)
    expect(read).toMatchObject({ subject: "Second look", bodyText: "Now wanted", metadata: {} })
    expect(read?.mailboxes.map(({ kind }) => kind)).not.toContain("envelope")
    expect(await (await store(env)).mail.search("wanted")).toHaveLength(1)
  })

  it("leaves mail stored in full whole when an envelope rule later matches it", async () => {
    const { env } = setup([mail(1, { from: [null, "deals@shop.example"] })])
    await importInto(env)

    const result = await importRuled(env, [envelope({ domain: "shop.example" })])

    expect(result).toMatchObject({ alreadyStored: 1, envelopes: 0 })
    expect((await emails(env))[0]?.bodyText).toBe("Synthetic body 1")
  })

  const applyRuled = async (env: NodeJS.ProcessEnv, ruled: MailRule[], apply: boolean) =>
    applyRules({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, rules: ruled },
      since: SINCE,
      apply,
      now: () => NOW,
    })

  it("cuts stored mail an envelope rule matches to its envelope, only with apply, and reads it again on keep", async () => {
    const deal = mail(2, {
      from: ["Shop Deals", "deals@shop.example"],
      subject: "Unrepeatable bargain",
      text: "Unrepeatable bargain inside",
      listId: "deals.shop.example",
    })
    const news = mail(3, { from: [null, "news@other.example"], text: "Synthetic headline" })
    const { env } = setup([mail(1), deal, news])
    await importInto(env)
    const ruled = [
      envelope({ list_id: "deals.shop.example" }),
      { match: { domain: "other.example" }, action: "skip" as const, decided_at: "2026-10-14T00:00:00.000Z" },
    ]

    const dry = await applyRuled(env, ruled, false)

    expect(dry).toMatchObject({ applied: false, listed: 3, envelopes: 1, skipMatched: 1 })
    expect(dry.bytes).toBe(Buffer.byteLength("Unrepeatable bargain inside"))
    expect(dry.rules).toMatchObject([{ rule: { match: { list_id: "deals.shop.example" } }, emails: 1 }])
    expect((await (await store(env)).mail.search("Unrepeatable")).map(({ externalId }) => externalId)).toEqual(["9002"])

    expect(await applyRuled(env, ruled, true)).toMatchObject({ applied: true, envelopes: 1 })

    const cut = (await emails(env)).find(({ externalId }) => externalId === "9002")
    expect(cut).toMatchObject({
      subject: null,
      bodyText: null,
      fromAddress: "deals@shop.example",
      metadata: {
        rule: { action: "envelope", match: { list_id: "deals.shop.example" } },
        subject: "Unrepeatable bargain",
        listId: "deals.shop.example",
      },
    })
    expect(cut?.mailboxes.map(({ externalId }) => externalId)).toContain("memo:envelope:list-id:deals.shop.example")
    expect((await emails(env)).find(({ externalId }) => externalId === "9003")?.bodyText).toBe("Synthetic headline")
    const opening = await store(env)
    expect(await opening.mail.search("Unrepeatable")).toEqual([])
    expect(
      (await opening.mail.chunksToEmbed("test-model", { limit: 100 })).filter(({ text }) => text.includes("bargain")),
    ).toEqual([])
    expect(await applyRuled(env, ruled, true)).toMatchObject({ envelopes: 0 })

    const reread = await importRuled(env, [{ ...envelope({ list_id: "deals.shop.example" }), action: "keep" }])

    expect(reread).toMatchObject({ saved: 1 })
    expect(await (await store(env)).mail.search("Unrepeatable")).toHaveLength(1)
  })

  it("fails the listing instead of importing mail unruled when Gmail refuses the header fetch", async () => {
    const { env } = setup([mail(1, { from: [null, "news@shop.example"] })], { headersFail: true })

    await expect(
      importMail({
        store: await store(env),
        source: himalayaSource(himalaya(env), { name: "test" }),
        account: { name: "test", address: ME, rules },
        since: SINCE,
        now: () => NOW,
        indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
      }),
    ).rejects.toMatchObject({ code: "rate_limited", details: { reason: "mail.throttled" } })
    expect(await emails(env)).toEqual([])
  })

  it("adds an mbox archive's mail to the IMAP account by Gmail id, skips by rule and deletes nothing", async () => {
    const { dir, env } = setup([mail(1)])
    await importInto(env)
    const body = (from: string) => `From: ${from}\nTo: ${ME}\nSubject: Old\n\nOld body\n`
    const path = join(dir, "archive.mbox")
    writeFileSync(
      path,
      [
        ["8001", "Alice Example <alice@example.test>"],
        ["8002", "news@shop.example"],
      ]
        .map(
          ([id, from]) => `From ${id}@xxx Mon Jul 24 10:00:00 +0000 2023\nX-GM-THRID: ${id}\n${body(from as string)}\n`,
        )
        .join(""),
    )

    const result = await importMail({
      store: await store(env),
      source: mboxSource(path),
      account: { name: "archive", address: ME, mode: "mbox", rules },
      since: new Date(0),
      now: () => NOW,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })

    expect(result).toMatchObject({ listed: 2, saved: 1, skipped: 1, deleted: 0 })
    expect(result.deletionsSkipped).toContain("snapshot")
    expect((await emails(env)).map(({ externalId }) => externalId).sort()).toEqual(["8001", "9001"])
  })

  it("leaves a mail IMAP proved deleted deleted when an mbox archive still holds it", async () => {
    const all = [1, 2, 3, 4, 5, 6].map((n) => mail(n))
    const { dir, env, write } = setup(all)
    await importInto(env)
    write(all.slice(0, 5))
    await importInto(env)
    const path = join(dir, "archive.mbox")
    writeFileSync(
      path,
      `From 9006@xxx Mon Jul 24 10:00:00 +0000 2023\nX-GM-THRID: 9006\nFrom: rin@example.test\nTo: ${ME}\nSubject: Old\n\nOld body\n\n`,
    )

    const result = await importMail({
      store: await store(env),
      source: mboxSource(path),
      account: { name: "archive", address: ME, mode: "mbox" },
      since: new Date(0),
      now: () => NOW,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })

    expect(result).toMatchObject({ listed: 1, saved: 0, alreadyStored: 1 })
    expect((await emails(env)).map(({ externalId }) => externalId)).not.toContain("9006")
  })
})

describe("importMail resuming", () => {
  const resumable = async (
    env: NodeJS.ProcessEnv,
    options: { max?: number; rescan?: boolean; at?: number; rules?: MailRule[] } = {},
  ) =>
    importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, ...(options.rules ? { rules: options.rules } : {}) },
      since: SINCE,
      now: () => options.at ?? NOW,
      resumeFrom: 0,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.rescan === undefined ? {} : { rescan: options.rescan }),
    })
  const listedUids = (log: string) => {
    const lines = readFileSync(log, "utf8").trim().split("\n")
    writeFileSync(log, "")
    return lines
      .filter(Boolean)
      .flatMap((line) => line.split(","))
      .sort()
  }
  const withLog = (messages: Fixture[], extra: Record<string, unknown> = {}) => {
    const log = join(mkdtempSync(join(tmpdir(), "log-")), "fetched.log")
    writeFileSync(log, "")
    return { ...setup(messages, { log, ...extra }), log }
  }

  it("lists only mail no earlier run finished, so a run cut short by max goes on without listing again", async () => {
    const { env, log } = withLog([mail(1), mail(2), mail(3), mail(4)])

    expect(await resumable(env, { max: 2 })).toMatchObject({ pass: "full", saved: 2, complete: false })
    expect(listedUids(log)).toEqual(["101", "102", "103", "104"])
    expect(await resumable(env, { max: 2 })).toMatchObject({ pass: "resumed", listed: 2, saved: 2, complete: true })
    expect(listedUids(log)).toEqual(["101", "102"])
    expect(await resumable(env)).toMatchObject({ pass: "resumed", listed: 0, saved: 0 })
    expect(listedUids(log)).toEqual([])
  })

  it("leaves deletions to a whole listing: with --rescan, after a day, or once the rules change", async () => {
    const all = [1, 2, 3, 4, 5, 6].map((n) => mail(n))
    const { env, write, log } = withLog(all)
    await resumable(env)
    write(all.slice(0, 5))

    const resumed = await resumable(env)
    expect(resumed).toMatchObject({ pass: "resumed", deleted: 0 })
    expect(resumed.deletionsSkipped).toContain("--rescan")
    expect(await resumable(env, { rescan: true })).toMatchObject({ pass: "full", deleted: 1 })
    listedUids(log)
    expect(await resumable(env, { at: NOW + 86_400_000 })).toMatchObject({ pass: "full", listed: 5 })
    const rules: MailRule[] = [{ match: { domain: "shop.example" }, action: "envelope", decided_at: "2026-10-01" }]
    expect(await resumable(env, { rules })).toMatchObject({ pass: "full", listed: 5 })
    expect(await resumable(env, { rules })).toMatchObject({ pass: "resumed", listed: 0 })
  })

  it("reports the widest window ever listed, not a later narrow run that started the resume point over", async () => {
    const { env } = withLog([1, 2, 3, 4, 5, 6].map((n) => mail(n)))
    await resumable(env, { max: 2 })
    const rules: MailRule[] = [{ match: { domain: "shop.example" }, action: "envelope", decided_at: "2026-10-01" }]
    await importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, rules },
      since: new Date("2026-09-15T00:00:00Z"),
      now: () => NOW,
      resumeFrom: 0,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })

    const status = await mailStatus(await store(env), { name: "test", address: ME }, new Date(NOW))
    expect(status.folders).toEqual([
      expect.objectContaining({
        since: SINCE.toISOString(),
        done: 2,
        total: 6,
        last: expect.objectContaining({ since: "2026-09-15T00:00:00.000Z", done: 2, total: 2 }),
      }),
    ])
    expect(status.progress).toMatchObject({ done: 2, total: 6, remaining: 4, state: "partial" })
    expect(statusText(status)).toContain("last run, since 2026-09-15 only: 2 of 2 done")
  })

  it("lists everything again when the mailbox's UIDVALIDITY changes", async () => {
    const { env, write } = withLog([mail(1), mail(2)])
    await resumable(env)
    write([mail(1), mail(2)], { validity: 13 })

    expect(await resumable(env)).toMatchObject({ pass: "full", listed: 2, alreadyStored: 2 })
  })

  it("keeps List-Id and the bulk fields on mail stored in full", async () => {
    const { env } = setup([mail(1, { listId: "news.shop.example" }), mail(2)])
    await importInto(env)

    const byId = new Map((await emails(env)).map((email) => [email.externalId, email.headers]))
    expect(byId.get("9001")).toEqual({ "list-id": "news.shop.example", "list-unsubscribe": true })
    expect(byId.get("9002")).toBeNull()
  })

  it("does not read an unchanged mbox file again once it was read to the end", async () => {
    const { dir, env } = setup([])
    const path = join(dir, "archive.mbox")
    const entry = (id: string) =>
      `From ${id}@xxx Mon Jul 24 10:00:00 +0000 2023\nX-GM-THRID: ${id}\nFrom: rin@example.test\nTo: ${ME}\n` +
      "Subject: Old\n\nOld body\n\n"
    writeFileSync(path, entry("8001"))
    const fromFile = async () =>
      importMail({
        store: await store(env),
        source: mboxSource(path),
        account: { name: "archive", address: ME, mode: "mbox" },
        since: new Date(0),
        now: () => NOW,
        indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
      })

    expect(await fromFile()).toMatchObject({ listed: 1, saved: 1 })
    expect(await fromFile()).toMatchObject({ listed: 0, saved: 0 })
    writeFileSync(path, entry("8001") + entry("8002"))
    expect(await fromFile()).toMatchObject({ listed: 2, saved: 1, alreadyStored: 1 })
  })
})

describe("memo sync --only mail", () => {
  const run = async (args: string[], env: NodeJS.ProcessEnv) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    for (const command of [program, ...program.commands]) command.exitOverride().configureOutput({ writeErr: () => {} })
    await program.parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const OTHER = "alice@example.com"
  const configured = (dir: string, env: NodeJS.ProcessEnv) => {
    const config = join(dir, "config")
    mkdirSync(config)
    writeFileSync(
      join(config, "config.json"),
      JSON.stringify({
        mail: {
          accounts: [
            { name: "test", address: ME },
            { name: "second", address: OTHER },
          ],
        },
      }),
    )
    return { ...env, MEMO_CONFIG_DIR: config, MEMO_STATE_DIR: join(dir, "state") }
  }

  it("says how to add an account when none is set", async () => {
    const { env } = setup([])

    expect(
      await run(["sync", "--only", "mail"], { ...env, MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "c-")) }),
    ).toContain("mail.accounts")
  })

  it("names the configured accounts when --account names none of them", async () => {
    const { dir, env } = setup([mail(1)])

    await expect(run(["sync", "--account", "nobody"], configured(dir, env))).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("it holds test, second"),
    })
    expect(await (await store(env)).accounts()).toEqual([])
  })

  it("takes an account by its address as well as its name", async () => {
    const { dir, env } = setup([mail(1)])

    const answer = envelopeOf(await run(["sync", "--account", OTHER, "--no-embed", "--json"], configured(dir, env)))

    expect(answer.item.mail).toMatchObject([{ account: OTHER, already_stored: 0 }])
    expect(answer.meta).toMatchObject({
      run_id: expect.any(String),
      duration_ms: expect.any(Number),
      accounts: ["second"],
    })
  })

  it("says how far an account's import is, from the store, in text and in JSON", async () => {
    const { dir, env } = setup([mail(1), mail(2), mail(3)])
    const withConfig = configured(dir, env)
    await run(["sync", "--account", "test", "--since-time", "2026-09-01", "--limit", "2", "--no-embed"], withConfig)

    expect(await run(["mail", "status", "test"], withConfig)).toContain("2 stored in full, 0 recorded as envelopes")
    const answer = envelopeOf(await run(["mail", "status", "test", "--json"], withConfig))
    expect(answer.item).toMatchObject({
      stored: 2,
      envelopes: 0,
      progress: { job: "mail", profile: "test", done: 2, total: 3, remaining: 1, state: "partial" },
      folders: [{ folder: "[Gmail]/All Mail", done: 2, total: 3, full_at: expect.any(String) }],
    })
    expect(answer.meta).toMatchObject({ accounts: ["test"] })
  })

  it("syncs only the account named, from the time asked, and reports what it did", async () => {
    const { dir, env } = setup([mail(1)])

    const result = answerOf(
      await run(
        ["sync", "--account", "second", "--since-time", "2026-09-01", "--no-embed", "--json"],
        configured(dir, env),
      ),
    )

    expect(result.notes).toEqual([])
    expect(result.mail).toMatchObject([{ account: OTHER, saved: 1, since: expect.stringMatching(/^2026-09-01/) }])
    expect((await (await store(env)).accounts()).filter(({ provider }) => provider === "email")).toEqual([
      { provider: "email", account: OTHER },
    ])
  })

  it("adds an envelope rule, records its mail on sync, and lists how many emails and bytes it recorded", async () => {
    const { dir, env } = setup([mail(1), mail(2, { from: [null, "deals@shop.example"] })])
    const withConfig = configured(dir, env)
    await run(["mail", "rules", "add", "test", "--domain", "shop.example", "--envelope"], withConfig)

    await run(["sync", "--account", "test", "--since-time", "2026-09-01", "--no-embed", "--json"], withConfig)
    const listed = answerOf(await run(["mail", "rules", "list", "test", "--json"], withConfig))

    expect(listed.items).toMatchObject([
      { action: "envelope", match: { domain: "shop.example" }, recorded: { emails: 1, bytes: expect.any(Number) } },
    ])
    expect(listed.items[0].recorded.bytes).toBeGreaterThan(0)
    expect(await run(["mail", "rules", "list", "test"], withConfig)).toMatch(
      /^envelope\s+domain shop\.example .* 1 emails/,
    )
    await expect(
      run(["mail", "rules", "add", "test", "--domain", "shop.example", "--envelope", "--skip"], withConfig),
    ).rejects.toThrow("give exactly one of --skip, --envelope, --keep")
  })

  it("refuses while another import holds the lock", async () => {
    const { dir, env } = setup([mail(1)])
    const withConfig = configured(dir, env)
    mkdirSync(join(dir, "state"))
    writeFileSync(
      join(dir, "state", "import.lock"),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    )

    await expect(run(["sync", "--account", "test"], withConfig)).rejects.toThrow("is running")
  })

  it("says what memo mail rules apply would cut, cuts it with --yes, and counts it under the rule", async () => {
    const { dir, env } = setup([mail(1), mail(2, { from: [null, "deals@shop.example"], text: "Synthetic coupon" })])
    const withConfig = configured(dir, env)
    await run(["sync", "--account", "test", "--since-time", "2026-09-01", "--no-embed", "--json"], withConfig)
    await run(["mail", "rules", "add", "test", "--domain", "shop.example", "--envelope"], withConfig)

    const dry = envelopeOf(await run(["mail", "rules", "apply", "test", "--json"], withConfig))

    expect(dry.item).toMatchObject({ applied: false, envelopes: 1, skip_matched: 0 })
    expect(dry.item.rules).toMatchObject([{ rule: { match: { domain: "shop.example" } }, emails: 1 }])
    expect(dry.meta).toMatchObject({ run_id: expect.any(String), accounts: ["test"] })
    expect(await run(["mail", "rules", "apply", "test"], withConfig)).toMatch(/would cut 1 emails .* --yes cuts them/)

    expect(await run(["mail", "rules", "apply", "test", "--yes"], withConfig)).toMatch(
      /^domain shop\.example\s+1 emails/,
    )

    const listed = answerOf(await run(["mail", "rules", "list", "test", "--json"], withConfig))
    expect(listed.items[0].recorded.emails).toBe(1)
    expect(await (await store(env)).mail.search("coupon")).toEqual([])
  })

  it("moves the config's rules into the store on first use, keeps a backup, and counts mail recorded before", async () => {
    const { dir, env } = setup([mail(1), mail(2, { from: [null, "deals@shop.example"] })])
    const withConfig = configured(dir, env)
    const envelope: MailRule = { match: { domain: "shop.example" }, action: "envelope", decided_at: "2026-10-01" }
    // Recorded by a memo that kept its rules in the config: the email knows its rule only by its mailbox.
    await importMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, rules: [envelope] },
      since: SINCE,
      now: () => NOW,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })
    const configFile = join(withConfig.MEMO_CONFIG_DIR, "config.json")
    const config = JSON.parse(readFileSync(configFile, "utf8"))
    config.mail.accounts[0].rules = [
      { match: { domain: "shop.example" }, action: "envelope", decided_at: "2026-10-01" },
      {
        match: { domain: "gov.example" },
        action: "keep",
        reason: "government notices: never remove",
        decided_at: "2026-10-02",
      },
    ]
    writeFileSync(configFile, JSON.stringify(config))

    const listed = answerOf(await run(["mail", "rules", "list", "test", "--json"], withConfig))

    expect(listed.items).toMatchObject([
      { action: "envelope", match: { domain: "shop.example" }, recorded: { emails: 1 } },
      { action: "keep", match: { domain: "gov.example" }, protected: true },
    ])
    expect(JSON.parse(readFileSync(configFile, "utf8")).mail.accounts[0].rules).toBeUndefined()
    const backups = readdirSync(withConfig.MEMO_CONFIG_DIR).filter((name) => name.includes("before-rules-in-store"))
    expect(backups).toHaveLength(1)
    expect(statSync(join(withConfig.MEMO_CONFIG_DIR, backups[0] as string)).mode & 0o777).toBe(0o600)
    expect(answerOf(await run(["mail", "rules", "list", "test", "--json"], withConfig)).items).toHaveLength(2)
  })

  it("exports an account's rules to a file and imports them into another account", async () => {
    const { dir, env } = setup([mail(1)])
    const withConfig = configured(dir, env)
    await run(
      ["mail", "rules", "add", "test", "--list-id", "news.shop.example", "--skip", "--reason", "noise"],
      withConfig,
    )
    await run(["mail", "rules", "add", "test", "--from", "boss@work.example", "--keep"], withConfig)

    const file = join(dir, "rules.json")
    writeFileSync(file, await run(["mail", "rules", "export", "test"], withConfig))
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ version: 1, account: ME })
    expect(await run(["mail", "rules", "import", "second", file], withConfig)).toBe("imported 2 rules into second\n")

    expect(answerOf(await run(["mail", "rules", "list", "second", "--json"], withConfig)).items).toMatchObject([
      { action: "skip", match: { list_id: "news.shop.example" }, reason: "noise" },
      { action: "keep", match: { from: "boss@work.example" } },
    ])
    writeFileSync(file, JSON.stringify({ rules: [{ match: {}, action: "skip" }] }))
    await expect(run(["mail", "rules", "import", "second", file], withConfig)).rejects.toMatchObject({
      details: { reason: "mail.rules-file-invalid" },
    })
  })

  it("refuses memo mail rules apply while a sync holds the lock", async () => {
    const { dir, env } = setup([mail(1)])
    const withConfig = configured(dir, env)
    mkdirSync(join(dir, "state"))
    writeFileSync(
      join(dir, "state", "import.lock"),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    )

    await expect(run(["mail", "rules", "apply", "test", "--yes"], withConfig)).rejects.toMatchObject({
      details: { reason: "sync.running" },
    })
  })
})
