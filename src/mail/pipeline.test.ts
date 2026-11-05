import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { type EmailInput, type MailboxInput, openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"

const ME = "me@example.com"
const MAILBOX = `email:${ME}`
const AGENT = { AI_AGENT: "claude-code_2-1-296_agent" }
const ANOTHER_AGENT = { AI_AGENT: "codex_synthetic" }
const LOCKED = { ...AGENT, MEMO_READ_ONLY: "1" }
const NOBODY: Terminal = { present: false }
const OWNER: Terminal = { present: true }
const BULK: MailboxInput = { externalId: "memo:bulk", name: "bulk", kind: "bulk" }
const HOUR = 3_600_000

afterEach(() => {
  process.exitCode = 0
})

type Item = { ref: string; chat_id: string; sender_is_me: boolean; email: Record<string, unknown> }
type Review = { items: Item[]; next?: { step?: string; args?: { cursor?: string } }[]; missing?: { why: string }[] }

const email = (id: string, hoursAgo: number, fields: Partial<EmailInput> = {}): EmailInput => ({
  externalId: `<${id}@example.com>`,
  subject: id,
  from: { address: "ann@example.com", name: "Ann" },
  to: [{ address: ME, name: "Me" }],
  sentAt: Date.now() - hoursAgo * HOUR,
  receivedAt: Date.now() - hoursAgo * HOUR,
  bodyText: `text of ${id}`,
  ...fields,
})

const mailbox = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-mail-pipeline-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(dir, "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-mail-pipeline-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const withStore = async <T>(work: (store: Awaited<ReturnType<typeof openStore>>) => Promise<T>) => {
    const store = await openStore({ env })
    try {
      return await work(store)
    } finally {
      await store.close()
    }
  }
  const accountId = await withStore((store) =>
    store.accounts.saveAccount({ provider: "email", account: ME }, { name: null }),
  )
  const thread = (id: string, ...emails: EmailInput[]) =>
    withStore((store) => store.mail.saveThread({ accountId, externalId: id, now: Date.now(), emails }))
  // review reads only what a finished sync covered
  const synced = () =>
    withStore((store) =>
      store.sync.setSyncState(
        { provider: "email", account: ME },
        "mail_coverage",
        JSON.stringify({ since: new Date(0).toISOString(), until: new Date().toISOString(), state: "window" }),
      ),
    )
  const memo = async (as: Record<string, string>, terminal: Terminal, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...as }, terminal })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return envelopeOf(streams.stdout.join(""))
  }
  /** The reason a command was refused for, however memo reports it: thrown, or printed with an exit code. */
  const refusal = async (as: Record<string, string>, ...args: string[]) => {
    const streams = captureStreams()
    process.exitCode = 0
    try {
      await createProgram({ streams, env: { ...env, ...as }, terminal: NOBODY })
        .exitOverride()
        .parseAsync([...args, "--json"], { from: "user" })
    } catch (error) {
      const { code, details } = error as { code?: string; details?: { reason?: string } }
      return details?.reason ?? code ?? String(error)
    }
    const printed = [...streams.stdout, ...streams.stderr].join("")
    if (!process.exitCode) return "ran"
    return /"reason":"([^"]+)"/.exec(printed)?.[1] ?? printed
  }
  const file = (name: string, value: unknown) => {
    const path = join(dir, name)
    writeFileSync(path, JSON.stringify(value))
    return path
  }
  const review = async (): Promise<Review & { cursor: string }> => {
    const answer = (await memo(
      LOCKED,
      NOBODY,
      "mail",
      "review",
      "--holder",
      "mail-triage",
      "--source",
      MAILBOX,
    )) as Review
    const cursor = answer.next?.find((one) => one.step === "mail-messages.acknowledge")?.args?.cursor
    if (!cursor) throw new Error("review gave no cursor")
    return { ...answer, cursor }
  }
  const acknowledge = (cursor: string) =>
    memo(LOCKED, NOBODY, "messages", "acknowledge", "--holder", "mail-triage", "--cursor", cursor, "--source", MAILBOX)
  return { dir, env, withStore, thread, synced, memo, refusal, file, review, acknowledge }
}

/** A mailbox past its first run, with an open task the owner opened from Ann's request. */
const triaged = async () => {
  const box = await mailbox()
  await box.thread("t-lease", email("lease", 30))
  await box.synced()
  const lease = `msg:email/${encodeURIComponent(ME)}/t-lease/${encodeURIComponent("<lease@example.com>")}`
  const added = (await box.memo({}, OWNER, "tasks", "add", lease, "--title", "Send the signed lease")).item
  const task = { ref: `task:${added.task.key}` }
  await box.acknowledge((await box.review()).cursor)
  return { ...box, task }
}

const evidenceOf = (item: Item) => [{ reference: item.ref, fingerprint: item.email.fingerprint as string }]

/** What the mail-triage skill does, scripted: a close for the owner's reply, a task and a contact for a new sender. */
const scriptedAgent = (items: Item[], task: { ref: string }, through: string) => {
  const reply = items.find((item) => item.chat_id === "t-lease" && item.sender_is_me)
  const ask = items.find((item) => item.chat_id === "t-new")
  if (!reply || !ask) throw new Error("the review lost an email the agent needs")
  return {
    schema_version: 1,
    key: `mail-triage:${through}`,
    extractor: "mail-triage/1",
    findings: [
      {
        id: "u1",
        kind: "task_update",
        task: task.ref,
        change: "close",
        reason: "you replied",
        evidence: evidenceOf(reply),
      },
      {
        id: "t1",
        kind: "task",
        type: "chore",
        title: "Send Bob the quote",
        reason: "Bob asks for a quote",
        commitment: "explicit",
        evidence: evidenceOf(ask),
      },
      { id: "c1", kind: "new_contact", address: "bob@example.org", name: "Bob", evidence: evidenceOf(ask) },
    ],
  }
}

const BOB_ASKS =
  "Could you send the quote?\n-- \nBob Example\n\nOn Mon, 3 Nov 2026, Ann <ann@example.com> wrote:\n> earlier"

it("gives the agent only mail worth reading, stages its batch once, and moves the mark only after staging", async () => {
  const box = await triaged()
  await box.thread(
    "t-lease",
    email("lease", 30),
    email("signed", 1, { from: { address: ME, name: "Me" }, to: [{ address: "ann@example.com", name: "Ann" }] }),
  )
  await box.thread(
    "t-new",
    email("quote", 1, { from: { address: "bob@example.org", name: "Bob" }, bodyText: BOB_ASKS }),
  )
  await box.thread("t-news", email("news", 1, { from: { address: "news@example.net", name: null }, mailboxes: [BULK] }))
  await box.thread("t-scam", email("prize", 1, { from: { address: "scam@example.net", name: null } }))
  await box.thread("t-big", email("big", 1, { metadata: { partial: { bytes: 100 } } }))
  await box.withStore(async (store) => {
    const account = await store.accounts.storedAccount({ provider: "email", account: ME })
    await store.mail.setSenderScores(
      Number(account?.id),
      [{ address: "scam@example.net", score: 9, signals: ["brand_spoof"], demoted: true }],
      Date.now(),
    )
  })
  await box.synced()

  const read = await box.review()

  expect(read.items.map((item) => item.chat_id).sort()).toEqual(["t-lease", "t-new"])
  expect(read.missing?.map((one) => one.why).join("; ")).toMatch(/1 partial emails held.*1 bulk.*1 suspicious/)
  const ask = read.items.find((item) => item.chat_id === "t-new") as Item
  expect(ask.email).toMatchObject({ new_sender: true, sender_identities: 1 })
  const shown = (await box.memo(LOCKED, NOBODY, "messages", "show", ask.ref)).item
  expect(shown.fingerprint).toBe(ask.email.fingerprint)
  expect(shown.text).toContain("> earlier")
  const own = "quote\n\nCould you send the quote?"
  expect((ask as Item & { text: string }).text).toBe(own)
  const trimmed = (await box.memo(LOCKED, NOBODY, "messages", "show", ask.ref, "--trimmed")).item
  expect(trimmed).toMatchObject({ text: own, fingerprint: ask.email.fingerprint })
  const context = (await box.memo(LOCKED, NOBODY, "context", "email:bob@example.org", "--trimmed")).item
  expect(context.messages.last.from_them_anywhere.text).toBe(own)

  const through = read.cursor.split(".")[0] as string
  const findings = box.file("findings.json", scriptedAgent(read.items, box.task, through))
  const staged = (await box.memo(LOCKED, NOBODY, "mail", "findings", "add", findings, "--source", MAILBOX)).item
  expect(staged).toMatchObject({ status: "proposed", author: { type: "bot", name: "claude-code" } })
  expect((await box.review()).items).toHaveLength(2)

  await box.acknowledge(read.cursor)
  expect((await box.review()).items).toEqual([])
  const again = (await box.memo(LOCKED, NOBODY, "mail", "findings", "add", findings, "--source", MAILBOX)).item
  expect(again.id).toBe(staged.id)
  expect((await box.memo({}, NOBODY, "mail", "findings", "list", "status:proposed")).items).toHaveLength(1)
})

it("leaves every decision to the owner, and the owner's confirm closes the task the reply answered", async () => {
  const box = await triaged()
  await box.thread(
    "t-lease",
    email("lease", 30),
    email("signed", 1, { from: { address: ME, name: "Me" }, to: [{ address: "ann@example.com", name: "Ann" }] }),
  )
  await box.thread("t-new", email("quote", 1, { from: { address: "bob@example.org", name: "Bob" } }))
  await box.synced()
  const read = await box.review()
  const findings = box.file("findings.json", scriptedAgent(read.items, box.task, read.cursor.split(".")[0] as string))
  const batch = (await box.memo(LOCKED, NOBODY, "mail", "findings", "add", findings, "--source", MAILBOX)).item

  for (const decide of [
    ["review", "confirm", `${batch.id}/u1`, "--reason", "the owner replied"],
    ["actions", "confirm", batch.id, "--reason", "the owner replied"],
    ["actions", "reject", batch.id, "--reason", "noise"],
  ])
    expect(await box.refusal(ANOTHER_AGENT, ...decide)).toBe("proposal.owner-only")
  expect(await box.refusal(AGENT, "actions", "confirm", batch.id, "--reason", "mine")).toBe("proposal.owner-only")
  expect(await box.refusal(LOCKED, "review", "confirm", `${batch.id}/u1`)).toBe("permission_error")

  await box.memo({}, OWNER, "review", "confirm", `${batch.id}/u1`)

  const card = (await box.memo({}, NOBODY, "tasks", "show", box.task.ref.slice("task:".length), "--source", MAILBOX))
    .item
  expect(card).toMatchObject({ status: "done", reason: "you replied" })
  expect((await box.memo({}, NOBODY, "mail", "findings", "show", batch.id)).item.status).toBe("reviewed")
})

it("refuses a batch that cites mail changed since review, and stages nothing", async () => {
  const box = await triaged()
  await box.thread("t-new", email("quote", 1, { from: { address: "bob@example.org", name: "Bob" } }))
  await box.synced()
  const [item] = (await box.review()).items as [Item]
  const stale = box.file("stale.json", {
    schema_version: 1,
    key: "mail-triage:1",
    extractor: "mail-triage/1",
    findings: [
      {
        id: "c1",
        kind: "new_contact",
        address: "bob@example.org",
        name: "Bob",
        evidence: [{ reference: item.ref, fingerprint: "0".repeat(64) }],
      },
    ],
  })

  expect(await box.refusal(LOCKED, "mail", "findings", "add", stale, "--source", MAILBOX)).toBe("mail-findings.stale")
  expect((await box.memo({}, NOBODY, "mail", "findings", "list")).items).toEqual([])
})

it("lets a read-only agent stage and acknowledge, and refuses every other change", async () => {
  const box = await triaged()
  for (const change of [
    ["tasks", "add", "--project", "INBOX", "--title", "write"],
    ["facts", "add", "Ann signed", "--kind", "decision", "--subject", "person:1"],
    ["memories", "add", "Ann prefers mail", "--kind", "summary", "--scope", "work", "--evidence", "note:1"],
    ["actions", "add", "reply", "--reason", "answer Ann", "--account", MAILBOX],
    ["people", "add", "Bob"],
  ])
    expect(await box.refusal(LOCKED, ...change), change.join(" ")).toBe("permission_error")
  expect(
    await box.refusal(
      LOCKED,
      "messages",
      "acknowledge",
      "--holder",
      "mail-triage",
      "--cursor",
      "0.0",
      "--source",
      MAILBOX,
    ),
  ).not.toBe("permission_error")
})

it("hands on review steps as memo's own commands, naming the mailbox", async () => {
  const box = await mailbox()
  await box.thread("t-quote", email("quote", 1))
  await box.synced()
  const read = await box.review()
  expect(read.next).toEqual([
    expect.objectContaining({
      step: "mail-messages.acknowledge",
      command: "messages acknowledge",
      args: { holder: "mail-triage", cursor: read.cursor, source: MAILBOX },
      line: `memo messages acknowledge --holder mail-triage --cursor ${read.cursor} --source ${MAILBOX}`,
    }),
  ])
})
