import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { type MessageStore, openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { afterEach, describe, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import { himalaya } from "./himalaya.js"
import { importMail } from "./import.js"
import { parseMail } from "./parse.js"
import { repairHtmlText } from "./repair.js"
import { himalayaSource } from "./source.js"

const ME = "owner@example.test"
const KEY = { provider: "email", account: ME }
const NOW = Date.parse("2026-10-04T12:00:00Z")
const SINCE = new Date("2026-09-01T00:00:00Z")
const PAGE = '<!DOCTYPE html><html><body><p>Flight AB123</p><!-- <a href="x">old.pdf</a> --><p>Gate 7</p></body></html>'

const opened: MessageStore[] = []
afterEach(async () => {
  for (const each of opened.splice(0)) await each.close()
})

const openAt = async (env: NodeJS.ProcessEnv) => {
  const store = await openStore({ env })
  opened.push(store)
  return store
}

const raw = (...lines: string[]) => new TextEncoder().encode(lines.join("\r\n"))

describe("an HTML page sent as text/plain", () => {
  it("is read as text, without its tags or comments", async () => {
    const parsed = await parseMail(raw("Subject: Itinerary", "Content-Type: text/plain", "", PAGE))

    expect(parsed.text).toBe("Flight AB123\nGate 7")
  })

  it("stored before the fix, is read as text once, in place", async () => {
    const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "repair-")), "store.db") }
    const store = await openAt(env)
    await store.saveAccount(KEY, { name: ME })
    const account = await store.storedAccount(KEY)
    await store.mail.saveThread({
      accountId: account.id,
      externalId: "t1",
      now: NOW,
      emails: [
        {
          externalId: "m1",
          subject: "Itinerary",
          from: { address: "a@example.test", name: null },
          sentAt: NOW,
          bodyText: PAGE,
        },
        { externalId: "m2", subject: "Plain", from: null, sentAt: NOW, bodyText: "Plain words" },
      ],
    })

    expect(await repairHtmlText(store, ME, NOW)).toBe(1)
    expect((await store.mail.email(account.id, "m1"))?.bodyText).toBe("Flight AB123\nGate 7")
    expect((await store.mail.email(account.id, "m2"))?.bodyText).toBe("Plain words")
    expect(await repairHtmlText(store, ME, NOW)).toBeUndefined()
  })
})

describe("bulk mail", () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "bulk-"))
    const mailbox = join(dir, "mailbox.json")
    const message = (n: number, extra: Record<string, unknown> = {}) => ({
      uid: String(100 + n),
      messageId: String(9000 + n),
      threadId: String(9000 + n),
      receivedAt: `2026-09-1${n}T08:00:00Z`,
      subject: `Trip plan ${n}`,
      from: ["Rin Example", `rin${n}@example.test`],
      to: [[null, ME]],
      text: `Trip plan ${n}`,
      ...extra,
    })
    writeFileSync(
      mailbox,
      JSON.stringify({
        messages: [message(1), message(2, { listId: "deals.shop.example", from: ["Shop", "news@shop.example"] })],
      }),
    )
    const config = join(dir, "config")
    mkdirSync(config)
    writeFileSync(join(config, "config.json"), JSON.stringify({ mail: { accounts: [{ name: "test", address: ME }] } }))
    return {
      ...process.env,
      MEMO_FAKE_MAILBOX: mailbox,
      MESSAGING_STORE: join(dir, "store.db"),
      MEMO_CONFIG_DIR: config,
    }
  }
  const rules = [
    { match: { domain: "other.example" }, action: "skip" as const, decided_at: "2026-10-14T00:00:00.000Z" },
  ]

  const search = async (args: string[], env: NodeJS.ProcessEnv) => {
    const streams = captureStreams()
    const program = createProgram({ streams, env })
    const quiet = (command: Command): void => {
      command.exitOverride().configureOutput({ writeErr: () => {} })
      for (const child of command.commands) quiet(child)
    }
    quiet(program)
    await program.parseAsync(["search", "mail", ...args, "--exact", "--json"], { from: "user" })
    return (answerOf(streams.stdout.join("")).items as { ref: string }[]).map(({ ref }) => ref)
  }

  it("is marked when read and left out of mail search unless --include bulk asks for it", async () => {
    const env = setup()
    await importMail({
      store: await openAt(env),
      source: himalayaSource(himalaya(env), { name: "test" }),
      account: { name: "test", address: ME, rules },
      since: SINCE,
      now: () => NOW,
      indexThreads: async () => ({ chats: 0, chunks: 0, left: false }),
    })
    const store = await openAt(env)
    const accountId = (await store.storedAccount(KEY)).id
    const boxes = async (id: string) =>
      ((await store.mail.email(accountId, id))?.mailboxes ?? []).map(({ externalId }) => externalId)
    expect(await boxes("9002")).toContain("memo:bulk")
    expect(await boxes("9001")).not.toContain("memo:bulk")
    await store.close()
    opened.splice(opened.indexOf(store), 1)

    const plain = await search(["trip", "--account", "test"], env)
    const all = await search(["trip", "--account", "test", "--include", "bulk"], env)
    expect(plain).toHaveLength(1)
    expect(all).toHaveLength(2)
  })
})
