import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"
import { binaryOf, profileFor, type RunChild, syncProfileOf } from "./messenger-sync.js"

const telegram = { provider: "telegram", account: "1" }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

/** A stand-in `tg` that records its arguments; chat 8 finds its session held by another run. */
const FAKE_TG = `#!/usr/bin/env node
// @wirecat/tg-cli test double
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_TG_LOG, JSON.stringify(args) + "\\n")
process.stderr.write(JSON.stringify({ event: "progress", step: "sync", fetched: 1 }) + "\\n")
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
  expect(stderr).not.toContain('"event"')
})

it("names the messenger CLI and profile to sync a chat it did not fetch", async () => {
  const { run } = await setUp()
  const { stdout } = await run("projects", "evidence", "SYP", "--source", "telegram:1")
  expect(stdout).toContain("— sync it: tg work messages sync 9 --since-time ")
})

it("never picks a profile: none or several signed in to the account is a refusal that names them", async () => {
  const { env, root } = await setUp()
  expect(profileFor("telegram", "1", env)).toEqual({ profile: "work" })
  expect(profileFor("telegram", "3", env)).toEqual({
    why: "no tg profile here is signed in to account 3; profiles: personal, work",
  })
  writeFileSync(join(root, "tg-state", "accounts", "spare.json"), JSON.stringify({ account: "1" }))
  expect(profileFor("telegram", "1", env)).toEqual({
    why: "2 tg profiles are signed in to account 1: spare, work — choose one with --sync-profile tg=<profile>",
  })
  expect(profileFor("telegram", "1", env, { tg: "spare" })).toEqual({ profile: "spare" })
  expect(profileFor("telegram", "1", env, { tg: "personal" })).toEqual({
    why: "tg profile personal is signed in to account 2, not 1",
  })
  expect(profileFor("telegram", "1", env, { tg: "gone" })).toEqual({
    why: "tg profile gone is not signed in here; profiles: personal, spare, work",
  })
})

it("with two profiles on the chat's account syncs as the one --sync-profile names, and none without it", async () => {
  const { env, root, run } = await setUp()
  writeFileSync(join(root, "tg-state", "accounts", "spare.json"), JSON.stringify({ account: "1" }))
  const evidence = (...more: string[]) =>
    run("projects", "evidence", "SYP", "--source", "telegram:1", "--sync-first", "--json", ...more)
  const refused = JSON.parse((await evidence()).stdout)
  expect(refused.item.fetch.map((one: { state: string }) => one.state)).toEqual(["failed", "failed"])
  expect(refused.item.fetch[0].reason).toContain("2 tg profiles are signed in to account 1: spare, work")
  expect(refused.missing).toContainEqual({
    field: "sync_command",
    why: "2 tg profiles are signed in to account 1: spare, work — choose one with --sync-profile tg=<profile>",
  })
  const chosen = JSON.parse((await evidence("--sync-profile", "tg=spare")).stdout)
  expect(chosen.item.fetch.map((one: { state: string }) => one.state)).toEqual(["partial", "complete"])
  const calls = readFileSync(String(env.FAKE_TG_LOG), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line)[0])
  expect(calls).toEqual(["spare", "spare"])
})

it("names in --json the command that syncs each chat held in part, and exits 0 on that partial answer", async () => {
  const { run } = await setUp()
  process.exitCode = 0
  const { stdout } = await run("projects", "evidence", "SYP", "--source", "telegram:1", "--json")
  expect(process.exitCode).toBe(0)
  const answer = JSON.parse(stdout)
  expect(answer.meta.complete).toBe(false)
  expect(
    answer.item.linked_chats.map((one: { chat: string; sync_command: string | null }) => [one.chat, one.sync_command]),
  ).toEqual([
    ["8", expect.stringMatching(/^tg work messages sync 8 --since-time \d{4}-\d{2}-\d{2}$/)],
    ["9", expect.stringMatching(/^tg work messages sync 9 --since-time \d{4}-\d{2}-\d{2}$/)],
  ])
})

it("takes --sync-profile as <tool>=<profile>, one profile per tool", () => {
  expect(syncProfileOf("max=default", syncProfileOf("tg=work"))).toEqual({ tg: "work", max: "default" })
  expect(() => syncProfileOf("telegram=work")).toThrow(/<tool>=<profile>/)
  expect(() => syncProfileOf("max=spare", { max: "default" })).toThrow(/one profile per tool/)
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
