import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-messaging/store"
import { afterEach, describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { decodeMailboxName, labelName } from "./gmail.js"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"

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
      run: himalaya(env),
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
      run: himalaya(env),
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

  it("drops the text of a mail deleted at the source", async () => {
    const { env, write } = setup([mail(1), mail(2), mail(3), mail(4), mail(5), mail(6)])
    await importInto(env)
    write([mail(1), mail(2), mail(3), mail(4), mail(5)])

    expect(await importInto(env)).toMatchObject({ deleted: 1 })
    expect((await emails(env)).map(({ externalId }) => externalId)).not.toContain("9006")
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

describe("memo mail <account> import", () => {
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

    await expect(
      run(["mail", "test", "import"], { ...env, MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "c-")) }),
    ).rejects.toThrow("add mail.accounts")
  })

  it("picks no account itself: without one, or with an unknown one, it lists the configured names", async () => {
    const { dir, env } = setup([mail(1)])
    const withConfig = configured(dir, env)

    await expect(run(["mail", "import"], withConfig)).rejects.toMatchObject({
      code: "validation_error",
      message: expect.stringContaining("mail.accounts holds test, second"),
    })
    await expect(run(["mail", "nobody", "import"], withConfig)).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("it holds test, second"),
    })
    await expect(run(["mail", "import", "--account", "test"], withConfig)).rejects.toThrow("unknown option")
    expect(await (await store(env)).accounts()).toEqual([])
  })

  it("imports only the account named, and reports what it did", async () => {
    const { dir, env } = setup([mail(1)])

    const text = await run(["mail", "second", "import", "--since", "2026-09-01", "--no-embed"], configured(dir, env))

    expect(text).toContain(`${OTHER}: 1 in All Mail since 2026-09-01, 1 saved, 0 already stored, 0 marked deleted.`)
    expect((await (await store(env)).accounts()).filter(({ provider }) => provider === "email")).toEqual([
      { provider: "email", account: OTHER },
    ])
  })

  it("refuses while another import holds the lock", async () => {
    const { dir, env } = setup([mail(1)])
    const withConfig = configured(dir, env)
    mkdirSync(join(dir, "state"))
    writeFileSync(
      join(dir, "state", "import.lock"),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    )

    await expect(run(["mail", "test", "import"], withConfig)).rejects.toThrow("already running")
  })
})
