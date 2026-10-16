import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import { afterEach, describe, expect, it } from "vitest"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import type { MailRule } from "./rules.js"
import { himalayaSource } from "./source.js"
import { backupMarker, restoreRun, trashMail, trashRuns } from "./trash.js"

const ME = "owner@example.test"
const NOW = Date.parse("2026-10-04T12:00:00Z")
const DECIDED = "2026-10-01T00:00:00.000Z"
const INBOX = '"\\\\Inbox"'
const TRASH = "[Gmail]/Bin"

interface Fixture {
  uid: string
  messageId: string
  threadId: string
  receivedAt: string
  subject: string
  from: [string | null, string]
  to: [string | null, string][]
  text: string
  listId?: string
  labels?: string[]
  flags?: string[]
  folder?: string
}

const mail = (n: number, overrides: Partial<Fixture> = {}): Fixture => ({
  uid: String(100 + n),
  messageId: String(9000 + n),
  threadId: String(9000 + n),
  receivedAt: `2026-08-${String(10 + n).padStart(2, "0")}T08:00:00Z`,
  subject: `Synthetic offer ${n}`,
  from: ["Shop Deals", `deals${n}@shop.example`],
  to: [[null, ME]],
  text: `Synthetic body ${n}`,
  labels: [INBOX],
  ...overrides,
})

const envelope: MailRule = { match: { domain: "shop.example" }, action: "envelope", decided_at: DECIDED }

const opened: MessageStore[] = []
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close()
})

const setup = (messages: Fixture[]) => {
  const dir = mkdtempSync(join(tmpdir(), "trash-"))
  const mailbox = join(dir, "mailbox.json")
  writeFileSync(mailbox, JSON.stringify({ messages }))
  const env = {
    ...process.env,
    MEMO_FAKE_MAILBOX: mailbox,
    MESSAGING_STORE: join(dir, "messages.db"),
    MEMO_STATE_DIR: join(dir, "state"),
  }
  const read = () => (JSON.parse(readFileSync(mailbox, "utf8")) as { messages: Fixture[] }).messages
  const change = (patch: Record<string, unknown>, edit: (messages: Fixture[]) => void = () => {}) => {
    const messages = read()
    edit(messages)
    writeFileSync(mailbox, JSON.stringify({ messages, ...patch }))
  }
  return { env, read, change, dir }
}

const store = async (env: NodeJS.ProcessEnv) => {
  const opening = await openStore({ env })
  opened.push(opening)
  return opening
}

const account = (rules: MailRule[]) => ({ name: "test", address: ME, rules })

const imported = async (env: NodeJS.ProcessEnv) =>
  importMail({
    store: await store(env),
    source: himalayaSource(himalaya(env), { name: "test" }),
    account: account([envelope]),
    since: new Date("2026-01-01T00:00:00Z"),
    now: () => NOW,
    indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
  })

const backedUp = (env: NodeJS.ProcessEnv, at: string) => {
  mkdirSync(dirname(backupMarker(env)), { recursive: true })
  writeFileSync(backupMarker(env), JSON.stringify({ at }))
}

const trash = async (env: NodeJS.ProcessEnv, apply: boolean, rules: MailRule[] = [envelope], limit?: number) =>
  trashMail({
    store: await store(env),
    source: himalayaSource(himalaya(env), { name: "test" }),
    account: account(rules),
    accounts: [account(rules)],
    env,
    apply,
    now: () => NOW,
    ...(limit === undefined ? {} : { limit }),
  })

describe("memo mail trash", () => {
  it("decides each envelope again and keeps replied, starred, labelled, protected and new mail in Gmail", async () => {
    const { env } = setup([
      mail(1),
      mail(2, { from: ["Shop Friend", "friend@shop.example"] }),
      mail(3, { flags: ["\\Flagged"] }),
      mail(4, { labels: [INBOX, "Bills"] }),
      mail(5, { receivedAt: "2026-09-20T08:00:00Z" }),
      mail(6, { from: ["Shop Office", "office@vip.shop.example"] }),
      mail(7, {
        from: [null, ME],
        to: [[null, "friend@shop.example"]],
        labels: ['"\\\\Sent"'],
        subject: "Thanks",
        text: "A reply the owner wrote",
      }),
    ])
    await imported(env)
    const keep: MailRule = {
      match: { domain: "vip.shop.example" },
      action: "keep",
      protected: true,
      decided_at: DECIDED,
    }

    const dry = await trash(env, false, [envelope, keep])

    expect(dry).toMatchObject({ applied: false, run: null, envelopes: 6, candidates: 1, trashed: 0, first_run: true })
    expect(dry.kept).toEqual({ replied: 1, starred: 1, labelled: 1, too_new: 1, protected: 1 })
    expect(dry.archive).toMatchObject({ ok: false, backup: { at: null }, takeout: { imported: false } })
  })

  it("keeps mail received before --since, whatever its rule", async () => {
    const { env } = setup([mail(1), mail(2), mail(3)])
    await imported(env)

    const dry = await trashMail({
      store: await store(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: account([envelope]),
      accounts: [account([envelope])],
      env,
      apply: false,
      since: new Date("2026-08-12T00:00:00Z"),
      now: () => NOW,
    })

    expect(dry).toMatchObject({ candidates: 2, kept: { before_since: 1 }, since: "2026-08-12T00:00:00.000Z" })
  })

  it("refuses to move mail until a fresh store backup is recorded", async () => {
    const { env } = setup([mail(1)])
    await imported(env)
    await expect(trash(env, true)).rejects.toThrow(/no store backup is recorded/)
    backedUp(env, "2026-09-01T00:00:00Z")
    await expect(trash(env, true)).rejects.toThrow(/older than 8 days/)
  })

  it("moves the oldest candidates to Trash, at most 100 on a first run, logs them and marks them deleted", async () => {
    const { env, read } = setup([mail(1), mail(2), mail(3)])
    await imported(env)
    backedUp(env, "2026-10-03T00:00:00Z")

    const first = await trash(env, true, [envelope], 2)

    expect(first).toMatchObject({ applied: true, candidates: 3, trashed: 2, not_moved: 0, limit: 2 })
    expect(
      read()
        .filter(({ folder }) => folder === TRASH)
        .map(({ uid }) => uid),
    ).toEqual(["101", "102"])
    expect(trashRuns(env, "test")).toMatchObject([{ id: first.run, trashed: 2, restored: 0 }])
    const opened = await store(env)
    const { id } = await opened.storedAccount({ provider: "email", account: ME })
    const refs = await opened.mail.emailRefs({ accountId: id, includeDeleted: true })
    expect(
      refs
        .filter(({ deleted }) => deleted)
        .map(({ externalId }) => externalId)
        .sort(),
    ).toEqual(["9001", "9002"])

    const again = await trash(env, false)
    expect(again).toMatchObject({ first_run: false, limit: 5000, candidates: 1 })
  })

  it("asks Gmail only about the emails it moves, and keeps one starred since the import", async () => {
    const { env, read, change, dir } = setup([mail(1), mail(2), mail(3)])
    await imported(env)
    backedUp(env, "2026-10-03T00:00:00Z")
    const log = join(dir, "imap.log")
    change({ log }, (messages) => {
      const first = messages.find(({ uid }) => uid === "101")
      if (first) first.flags = ["\\Flagged"]
    })

    const run = await trash(env, true, [envelope], 2)

    expect(run).toMatchObject({ candidates: 3, trashed: 1, kept: { starred: 1 } })
    expect(read().find(({ folder }) => folder === TRASH)?.uid).toBe("102")
    expect(readFileSync(log, "utf8").trim().split("\n").sort()).toEqual(["101,102", "msgid:9001", "msgid:9002"])
  })

  it("can restore a move Gmail made but answered with a throttle", async () => {
    const { env, read, change } = setup([mail(1)])
    await imported(env)
    backedUp(env, "2026-10-03T00:00:00Z")
    change({ moveFails: true })

    await expect(trash(env, true)).rejects.toThrow(/limiting this account/)
    expect(read()[0]?.folder).toBe(TRASH)
    change({ moveFails: false })
    const id = trashRuns(env, "test")[0]?.id as string
    const source = himalayaSource(himalaya(env), { name: "test" })

    const done = await restoreRun({ source, env, account: account([]), run: id, apply: true, now: () => NOW })

    expect(done).toMatchObject({ logged: 1, restored: 1 })
    expect(read()[0]?.folder).toBeUndefined()
  })

  it("finds Trash by its role, and says a folder is missing rather than throttled", async () => {
    const { env } = setup([mail(1)])
    const source = himalayaSource(himalaya(env), { name: "test" })

    expect(await source.folders?.()).toEqual({ all: "[Gmail]/All Mail", trash: TRASH })
    await expect(source.present?.(["101"], "[Gmail]/Trash")).rejects.toThrow(/no such mailbox/)
  })

  it("restores a run: back to the inbox with its labels, and only once", async () => {
    const { env, read } = setup([mail(1), mail(2, { labels: ["Deals"] })])
    await imported(env)
    backedUp(env, "2026-10-03T00:00:00Z")
    const rules: MailRule[] = [{ ...envelope, tags: ["Deals"] }]
    const run = (await trash(env, true, rules)).run as string
    expect(read().every(({ folder }) => folder === TRASH)).toBe(true)
    const source = himalayaSource(himalaya(env), { name: "test" })

    const dry = await restoreRun({ source, env, account: account([]), run, apply: false, now: () => NOW })
    expect(dry).toMatchObject({ logged: 2, restored: 2, missing: 0, expired: false, applied: false })

    const done = await restoreRun({ source, env, account: account([]), run, apply: true, now: () => NOW })
    expect(done).toMatchObject({ restored: 2, missing: 0 })
    const back = read()
    expect(back.every(({ folder }) => folder === undefined)).toBe(true)
    expect(back.find(({ uid }) => uid === "101")?.labels).toContain(INBOX)
    expect(back.find(({ uid }) => uid === "102")?.labels).toEqual(["Deals"])
    expect(trashRuns(env, "test")[0]).toMatchObject({ restored: 2 })

    const twice = await restoreRun({ source, env, account: account([]), run, apply: true, now: () => NOW })
    expect(twice).toMatchObject({ restored: 0, missing: 2 })
  })

  it("says a run past Gmail's 30 days of Trash is expired", async () => {
    const { env } = setup([mail(1)])
    await imported(env)
    backedUp(env, "2026-10-03T00:00:00Z")
    const run = (await trash(env, true)).run as string
    const source = himalayaSource(himalaya(env), { name: "test" })
    const later = await restoreRun({
      source,
      env,
      account: account([]),
      run,
      apply: false,
      now: () => NOW + 31 * 86_400_000,
    })
    expect(later.expired).toBe(true)
  })
})
