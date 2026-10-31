import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"
import { binaryOf, profileFor, type RunChild } from "./messenger-sync.js"

const telegram = { provider: "telegram", account: "1" }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

/** A stand-in `tg` that records its arguments; chat 8 finds its session held by another run. */
const FAKE_TG = `#!/usr/bin/env node
// @wirecat/tg-cli test double
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_TG_LOG, JSON.stringify(args) + "\\n")
process.stderr.write("page 1 saved\\n")
if (args.at(-1) === "8") {
  console.log(JSON.stringify({ error: { code: "configuration_error", message: "the session is held by another tg run" } }))
  process.exit(1)
}
console.log(JSON.stringify({ item: { complete: true } }))
`

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-fetch-"))
  const bin = join(root, "bin")
  mkdirSync(bin)
  writeFileSync(join(bin, "tg"), FAKE_TG)
  chmodSync(join(bin, "tg"), 0o755)
  const accounts = join(root, "tg-state", "accounts")
  mkdirSync(accounts, { recursive: true })
  writeFileSync(join(accounts, "work.json"), JSON.stringify({ account: "1" }))
  writeFileSync(join(accounts, "personal.json"), JSON.stringify({ account: "2" }))
  const env = {
    ...process.env,
    MESSAGING_STORE: join(root, "s.db"),
    TG_STATE_DIR: join(root, "tg-state"),
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    FAKE_TG_LOG: join(root, "tg.log"),
  }
  const store = await openStore({ env })
  for (const chat of ["8", "9"])
    await store.messages.saveMessages(
      telegram,
      chat,
      [
        {
          id: "1",
          chatId: chat,
          senderId: "9",
          senderName: null,
          timestamp: daysAgo(2),
          editedAt: null,
          text: "crew note",
          outgoing: false,
          attachments: [],
          replyTo: null,
          forwardedFrom: null,
          reactions: null,
        },
      ],
      { via: "test" },
    )
  const project = await store.knowledge.addProject({ name: "Synthetic Port", key: "SYP" })
  for (const chat of ["8", "9"])
    await store.knowledge.relate(null, {
      from: `chat:telegram/1/${chat}`,
      to: project.ref,
      kind: "member-of",
      confirmed: true,
    })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return { stdout: streams.stdout.join(""), stderr: streams.stderr.join("") }
  }
  return { env, root, run }
}

it("with --sync-first runs the messenger CLI for each linked chat it does not hold, as the profile of its account", async () => {
  const { env, run } = await setUp()
  const { stdout, stderr } = await run(
    "projects",
    "evidence",
    "SYP",
    "--source",
    "telegram:1",
    "--sync-first",
    "--sync-time",
    "1m",
    "--json",
  )
  const found = JSON.parse(stdout).item
  expect(
    found.fetch.map((one: { chat: string; state: string; reason: string | null }) => [one.chat, one.state, one.reason]),
  ).toEqual([
    [
      "chat:telegram/1/8",
      "partial",
      "tg work messages sync: configuration_error — the session is held by another tg run",
    ],
    ["chat:telegram/1/9", "complete", null],
  ])
  const calls = readFileSync(String(env.FAKE_TG_LOG), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  expect(calls[1]).toEqual([
    "work",
    "messages",
    "sync",
    "--since-time",
    expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    "--limit",
    "1000000",
    "--timeout",
    expect.stringMatching(/^\d+s$/),
    "--json",
    "--",
    "9",
  ])
  expect(stderr).toContain("tg: page 1 saved")
})

it("names the messenger CLI and profile to sync a chat it did not fetch", async () => {
  const { run } = await setUp()
  const { stdout } = await run("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(stdout).toContain("— sync it: tg work messages sync 9 --since-time ")
})

it("never picks a profile: none or several signed in to the account is a refusal that lists them", async () => {
  const { env, root } = await setUp()
  expect(profileFor("telegram", "1", env)).toEqual({ profile: "work" })
  expect(profileFor("telegram", "3", env)).toEqual({ profiles: ["personal", "work"] })
  writeFileSync(join(root, "tg-state", "accounts", "spare.json"), JSON.stringify({ account: "1" }))
  expect(profileFor("telegram", "1", env)).toEqual({ profiles: ["personal", "spare", "work"] })
})

it("runs only a WireCat binary: wcat-<tool> that describes itself as the tool, or a short name from its package", async () => {
  const { env, root } = await setUp()
  const run: RunChild = async () => ({ code: 0, stdout: JSON.stringify({ wcat_describe: 1, name: "tg" }) })
  expect(await binaryOf("telegram", env, run)).toBe(join(root, "bin", "tg"))
  writeFileSync(join(root, "bin", "wcat-tg"), "#!/bin/sh\n")
  chmodSync(join(root, "bin", "wcat-tg"), 0o755)
  expect(await binaryOf("telegram", env, run)).toBe(join(root, "bin", "wcat-tg"))
  writeFileSync(join(root, "bin", "tg"), "#!/bin/sh\necho someone else's tg\n")
  const other: RunChild = async () => ({ code: 0, stdout: JSON.stringify({ wcat_describe: 1, name: "other" }) })
  expect(await binaryOf("telegram", env, other)).toBeUndefined()
})
