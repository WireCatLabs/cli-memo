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
/** A run `schedule agent --on-new-mail mail-triage` started: under the lock, and naming the holder it may move. */
const LOCKED = { ...AGENT, MEMO_READ_ONLY: "1", MEMO_MAIL_HOLDER: "mail-triage" }
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
  const refusalAt = async (terminal: Terminal, as: Record<string, string>, ...args: string[]) => {
    const streams = captureStreams()
    process.exitCode = 0
    try {
      await createProgram({ streams, env: { ...env, ...as }, terminal })
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
  const refusal = (as: Record<string, string>, ...args: string[]) => refusalAt(NOBODY, as, ...args)
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
  return { dir, env, withStore, thread, synced, memo, refusal, refusalAt, file, review, acknowledge }
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
  await box.thread(
    "t-form",
    email("Форма: «Бизнес покажет»", 1, {
      from: { address: "info@site.example", name: null },
      mailboxes: [BULK],
      bodyText: "Имя: Иван\nТелефон: +7 900 000-00-00\nНомер заявки: 4512",
    }),
  )
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

  expect(read.items.map((item) => item.chat_id).at(-1)).toBe("t-form")
  expect(read.items.map((item) => item.chat_id).sort()).toEqual(["t-form", "t-lease", "t-new"])
  expect(read.items.at(-1)?.email).toMatchObject({ bulk: true, excerpt_only: true })
  expect(read.missing?.map((one) => one.why).join("; ")).toMatch(/1 partial emails held.*1 newsletter.*1 suspicious/)
  const ask = read.items.find((item) => item.chat_id === "t-new") as Item
  expect(ask.email).toMatchObject({ new_sender: true, sender_identities: 1 })
  const form = read.items.at(-1) as Item & { text: string }
  const whole = (await box.memo(LOCKED, NOBODY, "messages", "show", form.ref, "--trimmed")).item
  expect(whole).toMatchObject({ fingerprint: form.email.fingerprint })
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
  const agentFindings = scriptedAgent(read.items, box.task, through)
  const findings = box.file("findings.json", agentFindings)
  const staged = (await box.memo(LOCKED, NOBODY, "mail", "findings", "add", findings, "--source", MAILBOX)).item
  expect(staged).toMatchObject({ status: "proposed", author: { type: "bot", name: "claude-code" } })
  expect((await box.review()).items).toHaveLength(3)

  await box.acknowledge(read.cursor)
  expect((await box.review()).items).toEqual([])
  const inline = ` ${JSON.stringify(agentFindings)}`
  const again = (await box.memo(LOCKED, NOBODY, "mail", "findings", "add", inline, "--source", MAILBOX)).item
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

it("lets the owner confirm or reject a mail batch with the fingerprint it read, and refuses another", async () => {
  const box = await triaged()
  await box.thread(
    "t-lease",
    email("lease", 30),
    email("signed", 1, { from: { address: ME, name: "Me" }, to: [{ address: "ann@example.com", name: "Ann" }] }),
  )
  await box.thread("t-new", email("quote", 1, { from: { address: "bob@example.org", name: "Bob" } }))
  await box.synced()
  const read = await box.review()
  const stage = async (key: string) => {
    const agent = { ...scriptedAgent(read.items, box.task, read.cursor.split(".")[0] as string), key }
    return (
      await box.memo(LOCKED, NOBODY, "mail", "findings", "add", box.file(`${key}.json`, agent), "--source", MAILBOX)
    ).item
  }
  const first = await stage("mail-triage:1")
  const second = await stage("mail-triage:2")
  const wrong = "0".repeat(64)

  for (const [verb, id] of [
    ["confirm", first.id],
    ["reject", second.id],
  ])
    expect(await box.refusalAt(OWNER, {}, "actions", verb, id, "--fingerprint", wrong)).toBe("mail-findings.stale")
  await box.memo({}, OWNER, "actions", "confirm", first.id, "t1", "--fingerprint", first.fingerprint)
  await box.memo({}, OWNER, "actions", "reject", second.id, "--fingerprint", second.fingerprint)

  const shown = async (id: string) => (await box.memo({}, NOBODY, "mail", "findings", "show", id)).item.receipt
  expect((await shown(first.id)).accepted).toEqual(["t1"])
  expect((await shown(second.id)).accepted).toEqual([])
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

it("lets only the owner move the agent's mark back, and says how many emails it reads again", async () => {
  const box = await triaged()
  await box.thread("t-ask", email("ask", 2))
  await box.synced()
  await box.acknowledge((await box.review()).cursor)
  expect((await box.review()).items).toEqual([])
  const reset = ["messages", "reset", "--holder", "mail-triage", "--source", MAILBOX]

  expect(await box.refusal(LOCKED, ...reset, "--last", "1")).toBe("permission_error")
  expect(await box.refusal(AGENT, ...reset, "--last", "1")).toBe("mail.reset-owner-only")
  const dry = (await box.memo({}, OWNER, ...reset, "--last", "1", "--dry-run")).item
  expect(dry).toMatchObject({ again: 1, dry_run: true })
  expect((await box.review()).items).toEqual([])

  expect((await box.memo({}, OWNER, ...reset, "--last", "1")).item).toMatchObject({ again: 1, dry_run: false })
  expect((await box.review()).items.map((item) => item.chat_id)).toEqual(["t-ask"])
})

it("answers a findings file that is not there as not found, not as a crash", async () => {
  const box = await triaged()
  const missing = join(box.dir, "nowhere.json")
  expect(await box.refusal(LOCKED, "mail", "findings", "add", missing, "--source", MAILBOX)).toBe(
    "findings.file-missing",
  )
})

it("checks a whole batch with --dry-run under the read-only lock, and stages nothing until it is fixed", async () => {
  const box = await triaged()
  await box.thread(
    "t-lease",
    email("lease", 30),
    email("signed", 1, { from: { address: ME, name: "Me" }, to: [{ address: "ann@example.com", name: "Ann" }] }),
  )
  await box.thread("t-new", email("quote", 1, { from: { address: "bob@example.org", name: "Bob" } }))
  await box.synced()
  const read = await box.review()
  const agent = scriptedAgent(read.items, box.task, read.cursor.split(".")[0] as string)
  const ask = agent.findings[1]?.evidence
  const invoice = {
    id: "i1",
    kind: "invoice",
    direction: "payable",
    counterparty_name: "Bob Example GmbH",
    counterparty_email: "bob@example.org",
    currency: "EUR",
    lines: [{ description: "Quote", amount: "10.00" }],
    reason: "Bob bills the quote",
    evidence: ask,
  }
  const broken = {
    ...agent,
    findings: [...agent.findings, { ...invoice, id: "f1", kind: "fact", type: "fact" }, invoice],
  }
  const check = async (input: unknown) =>
    box.memo(LOCKED, NOBODY, "mail", "findings", "add", JSON.stringify(input), "--source", MAILBOX, "--dry-run")

  const refused = await check(broken)
  expect(refused.item).toMatchObject({ dry_run: true, valid: false, batch: null })
  expect(refused.item.problems).toEqual([
    expect.objectContaining({
      finding: "f1",
      kind: "fact",
      message: expect.stringMatching(/unknown mail finding fields direction, counterparty_name/),
    }),
  ])
  expect(refused.meta).toMatchObject({ complete: false })
  expect((await box.memo({}, NOBODY, "mail", "findings", "list")).items).toEqual([])

  const fixed = { ...agent, findings: [...agent.findings, invoice] }
  expect((await check(fixed)).item).toMatchObject({ valid: true, findings: 4, problems: [] })
  const staged = (await box.memo(LOCKED, NOBODY, "mail", "findings", "add", JSON.stringify(fixed), "--source", MAILBOX))
    .item
  expect(staged.input.findings.at(-1)).toMatchObject({ counterparty_name: "Bob Example GmbH" })
  expect((await check(fixed)).item).toMatchObject({ valid: true, batch: staged.id })
})
