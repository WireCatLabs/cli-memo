import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { sampleMeeting } from "@wirecat/cli-core/meetings/testing"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"
import type { Terminal } from "../terminal.js"

const CLAUDE = { AI_AGENT: "claude-code_2-1-296_agent" }
const NOBODY: Terminal = { present: false }
const OWNER: Terminal = { present: true }
const ACCOUNT = "example:synthetic"

afterEach(() => {
  process.exitCode = 0
})

const setUp = async () => {
  const dir = mkdtempSync(join(tmpdir(), "memo-review-kinds-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(dir, "s.db"),
    MEMO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "memo-review-kinds-config-")),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  const key = { provider: "example", account: "synthetic" }
  const project = await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
  const note = await store.notes.addNote({ text: "# Harbour brief\n\nThe launch plan." })
  const sample = sampleMeeting()
  sample.meeting.accountId = await store.accounts.saveAccount(key, { name: "Synthetic" })
  const meeting = await store.meetings.saveMeeting(sample)
  await store.knowledge.linkMeetingProject(key, String(meeting.meeting.id), project.id, { by: "owner" })
  await store.tasks.create({ project: project.ref, title: "Send the signed lease", type: "chore" }, "owner")
  const [task] = await store.tasks.find({ project: project.ref, status: "open", limit: 1 })
  if (!task) throw new Error("no task")
  await store.tasks.suggestClose(task.id, { as: "done", certainty: 0.8, reason: "you replied" }, { bot: "claude-code" })
  const mail = await store.proposedActions.propose({
    kind: "mail_findings",
    by: { bot: "mail-triage" },
    account: key,
    payload: { findings: [] },
    reason: "synthetic",
  })
  await store.close()

  const raw = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: { ...env, ...agent }, terminal })
      .exitOverride()
      .parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const run = async (agent: Record<string, string>, terminal: Terminal, ...args: string[]) =>
    envelopeOf(await raw(agent, terminal, ...args, "--json"))

  const hits = await run({}, OWNER, "search", "meetings", "Ship", "--source", ACCOUNT)
  const passage = (await run({}, OWNER, "meetings", "passage", hits.items[0].ref, "--source", ACCOUNT)).item
  const evidence = [{ reference: passage.target_ref, fingerprint: passage.target_fingerprint }]
  const file = join(dir, "findings.json")
  writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      key: "harbour-followups",
      extractor: "synthetic",
      findings: [
        {
          id: "followup",
          kind: "task",
          type: "chore",
          title: "Check draft status",
          reason: "asked in the meeting",
          commitment: "inferred",
          project: project.ref,
          evidence,
        },
        {
          id: "budget",
          kind: "task",
          type: "chore",
          title: "Collect the budget",
          reason: "asked in the meeting",
          commitment: "inferred",
          project: project.ref,
          evidence,
        },
      ],
    }),
  )
  const batch = (await run(CLAUDE, NOBODY, "meetings", "actions", "add", file, "--account", ACCOUNT)).item
  await run(
    CLAUDE,
    NOBODY,
    "facts",
    "add",
    "Kickoff moved to Friday",
    "--kind",
    "decision",
    "--project",
    "SYH",
    "--evidence",
    note.ref,
  )
  return { env, project, task, mail, batch: String(batch.id), raw, run }
}

const kindsOf = (items: { kind: string }[]) => {
  const counts: Record<string, number> = {}
  for (const { kind } of items) counts[kind] = (counts[kind] ?? 0) + 1
  return counts
}

it("lists each kind waiting for the owner once, grouped by where it came from", async () => {
  const f = await setUp()
  const listed = await f.run({}, OWNER, "review")
  expect(kindsOf(listed.items)).toEqual({ fact: 1, meeting_findings: 1, mail_findings: 1, task_close: 1 })
  const byKind = (kind: string) => listed.items.find((one: { kind: string }) => one.kind === kind)
  expect(byKind("meeting_findings")).toMatchObject({
    id: f.batch,
    owner_only: true,
    project: f.project.ref,
    parts: [{ id: "followup" }, { id: "budget" }],
  })
  expect(byKind("task_close")).toMatchObject({ id: `close:${f.task.key}`, owner_only: true, score: 0.8 })
  expect(byKind("mail_findings")).toMatchObject({ id: f.mail.id, owner_only: true, source: ACCOUNT })
  expect(byKind("fact")).toMatchObject({ owner_only: false })

  const text = await f.raw({}, OWNER, "review")
  expect(text).toContain("Synthetic Harbour")
  expect(text).toContain(ACCOUNT)
  expect(text).toContain(`${f.batch}/followup  task  Check draft status`)
  expect((await f.run({}, OWNER, "review", "kind:task_close")).items).toHaveLength(1)
})

it("confirms exactly the findings named and rejects the rest of the batch", async () => {
  const f = await setUp()
  const decided = (await f.run({}, OWNER, "review", "confirm", `${f.batch}/followup`)).item
  expect(decided.refused).toEqual([])
  expect(decided.decided).toMatchObject([{ id: f.batch, kind: "meeting_findings", status: "confirmed" }])
  expect(decided.decided[0].made).toHaveLength(1)
  const shown = (await f.run({}, OWNER, "review", "show", f.batch, "--brief")).item
  expect(shown.parts).toMatchObject([
    { id: "followup", outcome: "accepted" },
    { id: "budget", outcome: "rejected" },
  ])
  const tasks = (await f.run({}, OWNER, "tasks", "list", "project:SYH")).items.map(
    (one: { title: string }) => one.title,
  )
  expect(tasks).toContain("Check draft status")
  expect(tasks).not.toContain("Collect the budget")

  const closed = (await f.run({}, OWNER, "review", "confirm", `close:${f.task.key}`)).item
  expect(closed.decided).toMatchObject([{ kind: "task_close", status: "confirmed", made: [f.task.ref] }])
  expect((await f.run({}, OWNER, "review", "kind:task_close")).items).toEqual([])
})

it("refuses an agent on every owner-only kind, and refuses the owner a mail findings batch that is not one", async () => {
  const f = await setUp()
  const ids = [f.batch, `close:${f.task.key}`, f.mail.id]
  const tried = await f.run(CLAUDE, NOBODY, "review", "confirm", ids.join(","), "--reason", "looks right")
  expect(tried.item.decided).toEqual([])
  expect(tried.item.refused.map((one: { reason: string }) => one.reason)).toEqual([
    "proposal.owner-only",
    "proposal.owner-only",
    "proposal.owner-only",
  ])
  process.exitCode = 0
  const rejected = await f.run(CLAUDE, NOBODY, "review", "reject", f.batch, "--reason", "noise")
  expect(rejected.item.refused).toMatchObject([{ reason: "proposal.owner-only" }])
  process.exitCode = 0
  const mail = await f.run({}, OWNER, "review", "confirm", f.mail.id)
  expect(mail.item.refused).toMatchObject([{ code: "validation_error" }])
  process.exitCode = 0
  expect((await f.run({}, OWNER, "review")).items).toHaveLength(4)
})

it("says when nothing happened, and counts what waits in the status and in the project's context", async () => {
  const empty = mkdtempSync(join(tmpdir(), "memo-review-status-"))
  const env: NodeJS.ProcessEnv = { ...process.env, MESSAGING_STORE: join(empty, "s.db"), MEMO_CONFIG_DIR: empty }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const streams = captureStreams()
  await createProgram({ streams, env, terminal: OWNER })
    .exitOverride()
    .parseAsync(["review", "status"], { from: "user" })
  expect(streams.stdout.join("")).toMatch(/^nothing came in, nothing was proposed and nothing waits since /)

  const f = await setUp()
  const status = (await f.run({}, OWNER, "review", "status")).item
  expect(status).toMatchObject({ quiet: false, waiting: { count: 4, complete: true } })
  expect(status.proposed.kinds).toMatchObject({ meeting_findings: 1, mail_findings: 1, task_close: 1, fact: 1 })
  const context = (await f.run({}, OWNER, "projects", "context", "SYH")).item
  expect(context.review.waiting).toMatchObject({ count: 3, complete: true })
  expect(await f.raw({}, OWNER, "projects", "context", "SYH")).toContain("Pending review: 3 proposals waiting")
})
