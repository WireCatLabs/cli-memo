import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-core"
import { type MessageStore, openStore } from "@wirecat/cli-messaging/store"
import { afterEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"

const ME = "owner@example.test"
const KEY = { provider: "email", account: ME }
const NOW = Date.parse("2026-10-04T12:00:00Z")
const SINCE = new Date("2026-09-01T00:00:00Z")
const ANY = /[\s\S]?/

interface Fixture {
  uid: string
  messageId: string
  threadId: string
  receivedAt: string
  subject: string
  from: [string | null, string]
  to: [string | null, string][]
  text?: string
  html?: string
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
    run: himalaya(env),
    account: { name: "test", address: ME },
    since: SINCE,
    now: () => NOW,
    indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    ...(max === undefined ? {} : { max }),
  })

afterEach(async () => {
  for (const each of opened.splice(0)) await each.close()
})

describe("importMail", () => {
  it("saves each mail as a message of its Gmail thread, with the subject and the body as text", async () => {
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
    const saved = await (await store(env)).find({ account: KEY, chatId: "9001", pattern: ANY, limit: 10 })
    expect(saved.items.map(({ id, outgoing, chatTitle }) => ({ id, outgoing, chatTitle }))).toEqual([
      { id: "9002", outgoing: true, chatTitle: "Synthetic subject 1" },
      { id: "9001", outgoing: false, chatTitle: "Synthetic subject 1" },
    ])
    expect(saved.items[1]?.text).toBe("Synthetic subject 1\n\nSynthetic body 1")
    expect(saved.items[1]?.senderId).toBe("rin@example.test")
    expect(saved.items[1]?.locator).toBe(`msg:email/${encodeURIComponent(ME)}/9001/9001`)
  })

  it("adds nothing when run again", async () => {
    const { env } = setup([mail(1), mail(2)])
    await importInto(env)

    expect(await importInto(env)).toMatchObject({ saved: 0, alreadyStored: 2, deleted: 0 })
  })

  it("drops the text of a mail deleted at the source", async () => {
    const { env, write } = setup([mail(1), mail(2), mail(3), mail(4), mail(5), mail(6)])
    await importInto(env)
    write([mail(1), mail(2), mail(3), mail(4), mail(5)])

    expect(await importInto(env)).toMatchObject({ deleted: 1 })
    const left = await (await store(env)).find({ account: KEY, pattern: ANY, limit: 10 })
    expect(left.items.map(({ id }) => id)).not.toContain("9006")
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
    expect((await (await store(env)).find({ account: KEY, pattern: ANY, limit: 10 })).items).toHaveLength(2)
  })

  it("reads at most max new mails, newest first, and continues on the next run", async () => {
    const { env } = setup([mail(1), mail(2), mail(3)])

    expect(await importInto(env, 2)).toMatchObject({ saved: 2, complete: false })
    expect(await importInto(env, 2)).toMatchObject({ saved: 1, alreadyStored: 2, complete: true })
  })

  it("keeps plain line ends", async () => {
    const { env } = setup([mail(1, { text: "line one\r\nline two" })])
    await importInto(env)

    const [saved] = (await (await store(env)).find({ account: KEY, pattern: ANY, limit: 1 })).items
    expect(saved?.text).toBe("Synthetic subject 1\n\nline one\nline two")
  })

  it("turns an HTML-only mail into text", async () => {
    const { env } = setup([
      mail(1, { text: undefined, html: "<style>p{}</style><p>Hello&nbsp;there</p><p>A &amp; B</p>" }),
    ])
    await importInto(env)

    const [saved] = (await (await store(env)).find({ account: KEY, pattern: ANY, limit: 1 })).items
    expect(saved?.text).toBe("Synthetic subject 1\n\nHello there\nA & B")
  })
})

describe("memo mail import", () => {
  const run = async (args: string[], env: NodeJS.ProcessEnv) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }

  it("says how to add an account when none is set", async () => {
    const { env } = setup([])

    await expect(
      run(["mail", "import"], { ...env, MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "c-")) }),
    ).rejects.toThrow("add mail.accounts")
  })

  it("imports the configured account and reports what it did", async () => {
    const { dir, env } = setup([mail(1)])
    const config = join(dir, "config")
    mkdirSync(config)
    writeFileSync(join(config, "config.json"), JSON.stringify({ mail: { accounts: [{ name: "test", address: ME }] } }))

    const text = await run(["mail", "import", "--since", "2026-09-01"], { ...env, MEMO_CONFIG_DIR: config })

    expect(text).toContain(`${ME}: 1 in All Mail since 2026-09-01, 1 saved, 0 already stored, 0 marked deleted.`)
  })
})
