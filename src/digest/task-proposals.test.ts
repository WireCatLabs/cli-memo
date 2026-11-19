import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf, envelopeOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const tg = { provider: "telegram", account: "1" }

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-task-proposals-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
  }
  delete env.AI_AGENT
  delete env.CLAUDECODE
  const store = await openStore({ env })
  await store.accounts.saveAccount(tg, { name: "Kai Owner" })
  await store.knowledge.addProject({ name: "Synthetic Harbour", key: "SYH" })
  await store.messages.saveMessages(
    tg,
    "7",
    [
      {
        id: "1",
        chatId: "7",
        senderId: "9",
        senderName: "Rita Example",
        timestamp: new Date(Date.now() - 3_600_000).toISOString(),
        editedAt: null,
        text: "Please send the pier plan",
        outgoing: false,
        attachments: [],
        replyTo: null,
        forwardedFrom: null,
        reactions: null,
      },
    ],
    { via: "history" },
  )
  await store.close()
  const run = async (environment: NodeJS.ProcessEnv, ...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env: environment }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  const schedule = (name: string, prompt: string, last?: object, extra: object = {}) => {
    const dir = join(root, "data", "cli-memo", "schedules", name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, "schedule.json"),
      JSON.stringify({
        name,
        kind: "agent",
        argv: ["claude", "-p", prompt],
        environment: {},
        when: { every: 5 },
        ...extra,
      }),
    )
    if (last) writeFileSync(join(dir, "last.json"), JSON.stringify({ output: "run.md", ...last }))
  }
  return { env, run, schedule }
}

const sectionOf = (body: { item: { sections: { name: string }[] } }, name: string) =>
  body.item.sections.find((one) => one.name === name) as unknown as {
    total: number
    items: { ref: string; why: string }[]
    next: string[]
  }

it("lists the batches that hold tasks first, however many other proposals are newer, and counts their tasks", async () => {
  const { env, run } = await setUp()
  const agent = { ...env, AI_AGENT: "task-triage" }
  const evidence = answerOf(
    await run(env, "projects", "evidence", "SYH", "--source", "telegram:1", "--context-query", "pier", "--json"),
  )
  const cited = evidence.items[0]
  await run(
    agent,
    "projects",
    "actions",
    "add",
    JSON.stringify({
      schema_version: 1,
      key: "task-triage:1",
      extractor: "task-triage/1",
      findings: [
        {
          id: "t1",
          kind: "task",
          type: "chore",
          title: "Send Rita the pier plan",
          reason: "Rita asks for it",
          commitment: "explicit",
          project: "project:1",
          evidence: [{ reference: cited.ref, fingerprint: cited.fingerprint }],
        },
      ],
    }),
    "--json",
  )
  for (let i = 0; i < 4; i++) await run(agent, "facts", "add", `Synthetic fact ${i}`, "--json").catch(() => undefined)

  const body = envelopeOf(await run(env, "review", "agenda", "--json", "--limit", "2"))
  const proposals = sectionOf(body, "proposals")

  expect(proposals.items[0]).toMatchObject({ why: "findings: 1 task" })
  expect(proposals.next).toContain(
    "# 1 proposed tasks wait in 1 batches: memo review list kind:mail_findings,meeting_findings,findings",
  )
})

it("says in the tasks section when no agent proposes tasks, or when one stopped running, with the command that fixes it", async () => {
  const { env, run, schedule } = await setUp()
  const notes = async () => sectionOf(envelopeOf(await run(env, "review", "agenda", "--json")), "tasks").next

  expect(await notes()).toContainEqual(
    expect.stringMatching(/^# no agent proposes tasks from messengers; add one: memo schedule agent task-triage/),
  )

  schedule("task-triage", "Run memo skill show task-triage and follow it.", {
    at: "2026-11-12T08:00:15.555Z",
    exitCode: 0,
    skipped: {
      at: "2026-11-12T12:00:01.880Z",
      why: "it was saved by an older version, which kept no agent to rebuild its start from; save it again to run it",
      reason: "agent.refused",
    },
  })
  expect(await notes()).toContainEqual(
    expect.stringMatching(
      /^# task-triage has not run since 2026-11-12T08:00:15.555Z: it was saved by an older version.*save it again: memo schedule agent task-triage/,
    ),
  )

  schedule("task-triage", "Run memo skill show task-triage and follow it.", undefined, { paused: true })
  expect(await notes()).toContain(
    "# task-triage is paused, so messengers propose no tasks: memo schedule resume task-triage",
  )
})
