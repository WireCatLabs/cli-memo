import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

const MINE = { provider: "email", account: "me@example.com" }
const at = (day: number) => Date.UTC(2026, 9, day, 9)
const email = (externalId: string, day: number, outgoing = false) => ({
  externalId,
  subject: "Invented subject",
  from: outgoing ? { address: MINE.account, name: "Me" } : { address: "ann@example.com", name: "Ann" },
  to: [{ address: outgoing ? "ann@example.com" : MINE.account, name: null }],
  sentAt: at(day),
  receivedAt: at(day),
  bodyText: "An invented body.",
  outgoing,
})

it("**counts imported mail received and sent** by week and by sender, and records no search", async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-mail-stats-"))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "store.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const store = await openStore({ env })
  const accountId = await store.accounts.saveAccount(MINE, { name: null })
  await store.mail.saveThread({
    accountId,
    externalId: "thread-1",
    now: at(20),
    emails: [email("<a@example.com>", 5), email("<b@example.com>", 6), email("<c@example.com>", 7, true)],
  })
  const history = async () => (await store.searches.searchHistory(100)).length
  const before = await history()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return JSON.parse(streams.stdout.join("")).item
  }

  expect(await run("stats", "mail", "show", "--by", "week", "--timezone", "UTC", "--no-record", "--json")).toEqual({
    by: "week",
    received: 2,
    sent: 1,
    rows: [{ key: "2026-10-05", name: null, received: 2, sent: 1 }],
  })
  expect(
    await run(
      "stats",
      "mail",
      "show",
      "--by",
      "sender",
      "--source",
      "email:me@example.com",
      "--no-record",
      "--json",
      "--",
      "from:ann@example.com",
    ),
  ).toMatchObject({ rows: [{ key: "ann@example.com", name: "Ann", received: 2, sent: 0 }] })
  expect(await history()).toBe(before)
  await store.close()
})
