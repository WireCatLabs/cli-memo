import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { InMemoryTransport } from "@modelcontextprotocol/server"
import { metaOf } from "@wirecat/cli-base/commands"
import { isGroupAware } from "@wirecat/cli-core/cli"
import { ACME_PORTAL, type AcmeScenario, acmeScenario } from "@wirecat/cli-core/crm/testing"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { answerOf } from "../../test/answer.js"
import { commandCaller } from "../../test/mcp.js"
import { memoIn } from "../../test/memo.js"
import { createMemoServer } from "../mcp/server.js"
import { createProgram } from "../program.js"

const HOME = { provider: "telegram", account: "1" }
const WORK = { provider: "telegram", account: "2" }
const PORTAL = `${ACME_PORTAL.provider}:${ACME_PORTAL.account}`
/** Anything of the home account a work run must never print. */
const LEAKS = ["telegram/1", "telegram:1", "Lockcase at home", "Kin Example"]

const message = (id: string, sender: string, text: string) => ({
  id,
  chatId: sender,
  senderId: sender,
  senderName: null,
  timestamp: "2026-10-09T00:00:00Z",
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

let env: NodeJS.ProcessEnv
let refs: AcmeScenario["refs"]
let homeAction: string
let homeProposal: string
let locked: ReturnType<typeof memoIn>

const homePerson = async () => {
  const store = await openStore({ env })
  try {
    return (await store.people.personOf({ provider: "telegram", id: "301" }))?.uid
  } finally {
    await store.close()
  }
}

const leaked = (text: string) => LEAKS.filter((one) => text.includes(one))

const outputOf = async (run: Promise<unknown>) => {
  try {
    return JSON.stringify(await run)
  } catch (error) {
    return `${(error as { code?: string }).code ?? ""} ${(error as Error).message}`
  }
}

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-leak-"))
  env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const store = await openStore({ env })
  try {
    await store.accounts.registerProvider({ name: ACME_PORTAL.provider, kind: "crm", aliases: [] })
    refs = (await acmeScenario(store)).refs
    await store.sync.applyDelta(HOME, { people: [{ id: "301", name: "Kin Example" }] })
    await store.messages.saveMessages(HOME, "301", [message("1", "301", "Lockcase at home")], { via: "test" })
    await store.messages.saveMessages(WORK, "401", [message("1", "401", "Lockcase at work")], { via: "test" })
    await store.notes.addNote({ text: "Lockcase private thought" })
    await store.accounts.saveAccountGroup("work", ["telegram:2", PORTAL])
  } finally {
    await store.close()
  }
  const owner = memoIn(env)
  const project = (await owner("projects", "add", "Lockwork", "--key", "LKW")).ref as string
  await owner("relationships", "add", "chat:telegram/1/301", project)
  await owner("relationships", "add", "chat:telegram/2/401", project)
  await owner("tasks", "add", "msg:telegram/1/301/1", "--title", "home task Lockcase")
  await owner("tasks", "add", "--project", "LKW", "--title", "project task")
  await owner(
    "memories",
    "add",
    "Lockcase memory",
    "--kind",
    "summary",
    "--scope",
    "work",
    "--evidence",
    "msg:telegram/1/301/1",
  )
  await owner(
    "facts",
    "add",
    "Lockcase fact",
    "--kind",
    "statement",
    "--evidence",
    "msg:telegram/1/301/1",
    "--project",
    "LKW",
  )
  const action = await owner(
    "actions",
    "add",
    "reply",
    "--reason",
    "answer",
    "--target",
    "msg:telegram/1/301/1",
    "--payload",
    '{"text":"hi"}',
    "--account",
    "telegram:1",
  )
  homeAction = String(action.id)
  const agent = memoIn({ ...env, AI_AGENT: "test-agent" })
  const proposal = await agent("relationships", "add", `person:${await homePerson()}`, project, "--role", "contributor")
  homeProposal = String(proposal.id)
  vi.stubEnv("MEMO_GROUP_LOCK", "work")
  locked = memoIn({ ...env, MEMO_GROUP_LOCK: "work" })
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe("locked lists with items keep the group's evidence and count the rest", () => {
  it("lists memories and facts whose evidence is both in and outside the group, over the CLI and MCP", async () => {
    const owner = memoIn(env)
    const both = ["--evidence", "msg:telegram/2/401/1", "--evidence", "msg:telegram/1/301/1"]
    await owner("memories", "add", "Mixed memory", "--kind", "summary", "--scope", "work", ...both)
    await owner("facts", "add", "Mixed fact", "--kind", "statement", ...both)
    const check = (answer: { items: { text?: string; statement?: string; evidence?: unknown }[] }, text: string) => {
      const item = answer.items.find((one) => (one.text ?? one.statement) === text)
      expect(item, text).toBeDefined()
      expect(JSON.stringify(item?.evidence)).toContain("msg:telegram/2/401/1")
      expect(leaked(JSON.stringify(answer))).toEqual([])
      expect(JSON.stringify(answer)).toContain("out_of_scope")
    }
    check(await locked("memories", "list"), "Mixed memory")
    check(await locked("facts", "list"), "Mixed fact")
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer({ ...env, MEMO_GROUP_LOCK: "work" }, createProgram).connect(serverSide)
    const client = new Client({ name: "lists", version: "0" })
    await client.connect(clientSide)
    try {
      const call = await commandCaller(client)
      for (const [command, text] of [
        ["memories list", "Mixed memory"],
        ["facts list", "Mixed fact"],
      ] as const) {
        const result = await call(command, {})
        expect(result.isError, command).toBeFalsy()
        check(answerOf(JSON.stringify(result.structuredContent)), text)
      }
    } finally {
      await client.close()
    }
  })
})

describe("a work run shows nothing of the home account (final review cases)", () => {
  it("strips home evidence and sources from memories and facts", async () => {
    for (const args of [
      ["memories", "list"],
      ["memories", "show", "memory:1", "--sources"],
      ["facts", "list"],
      ["facts", "show", "fact:1", "--sources"],
      ["facts", "list", "project:LKW"],
    ])
      expect(leaked(await outputOf(locked(...args))), args.join(" ")).toEqual([])
  })

  it("neither lists, shows nor decides a home action", async () => {
    expect(leaked(await outputOf(locked("actions", "list")))).toEqual([])
    for (const verb of ["show", "confirm", "reject"])
      await expect(locked("actions", verb, homeAction), verb).rejects.toMatchObject({ code: "permission_error" })
  })

  it("neither shows nor decides a proposal about the home account", async () => {
    expect(leaked(await outputOf(locked("review", "list")))).toEqual([])
    await expect(locked("review", "show", homeProposal)).rejects.toMatchObject({ code: "permission_error" })
    await expect(locked("review", "confirm", homeProposal)).rejects.toMatchObject({ code: "permission_error" })
  })

  it("keeps home chats and evidence out of a project's context, status and review", async () => {
    for (const args of [
      ["projects", "context", "LKW"],
      ["projects", "status", "LKW"],
      ["review", "list", "project:LKW"],
      ["tasks", "list"],
    ])
      expect(leaked(await outputOf(locked(...args))), args.join(" ")).toEqual([])
  })

  it("says the same over MCP", async () => {
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await createMemoServer({ ...env, MEMO_GROUP_LOCK: "work" }, createProgram).connect(serverSide)
    const client = new Client({ name: "leak", version: "0" })
    await client.connect(clientSide)
    try {
      const call = await commandCaller(client)
      for (const [command, args] of [
        ["memories show", { ref: "memory:1", sources: true }],
        ["facts show", { ref: "fact:1", sources: true }],
        ["actions list", {}],
        ["actions show", { id: homeAction }],
        ["actions confirm", { id: homeAction, reason: "go" }],
        ["review list", {}],
        ["review confirm", { ids: [homeProposal], reason: "go" }],
        ["projects context", { project: "LKW" }],
      ] as const) {
        const answer = JSON.stringify(await call(command, args))
        expect(leaked(answer), command).toEqual([])
      }
      expect(await call("actions confirm", { id: homeAction, reason: "go" })).toMatchObject({ isError: true })
    } finally {
      await client.close()
    }
  })
})

/** A value for each argument name, so every read can run; an outside one would be refused, which is no leak. */
const SAMPLES = (top: string): Record<string, string> => ({
  query: "Lockcase",
  name: "Lockcase",
  person: refs.alice,
  organization: refs.acme,
  project: "LKW",
  note: "note:1",
  message: "msg:telegram/2/401/1",
  task: "LKW-1",
  ref: top === "memories" ? "memory:1" : top === "facts" ? "fact:1" : top === "leads" ? "lead:1" : refs.deal,
  id: top === "actions" ? homeAction : top === "review" ? homeProposal : top === "tasks" ? "LKW-1" : "1",
  ids: homeProposal,
  list: "list:organization",
})

const reads = (program: Command): { path: string[]; command: Command }[] => {
  const walk = (command: Command, path: string[]): { path: string[]; command: Command }[] =>
    command.commands.length
      ? command.commands.flatMap((child) => walk(child, [...path, child.name()]))
      : [{ path, command }]
  return walk(program, []).filter(
    ({ path, command }) => path[0] !== "mcp" && isGroupAware(command) && metaOf(command).effects?.local !== "write",
  )
}

describe("a generic leak scan of every group-aware read under the lock", () => {
  it("prints no home reference or home text in any answer or refusal", async () => {
    const program = createProgram({ env })
    const found: string[] = []
    for (const { path, command } of reads(program)) {
      const samples = SAMPLES(path[0] as string)
      // A list's query narrows it; the scan reads each list whole.
      const args = command.registeredArguments.flatMap((argument) => {
        const value = argument.name() === "query" && path.at(-1) === "list" ? undefined : samples[argument.name()]
        return value === undefined ? [] : [value]
      })
      const answer = await outputOf(locked(...path, ...args))
      for (const one of leaked(answer)) found.push(`${path.join(" ")}: ${one}`)
      // A list runs with items in this fixture: it answers, it does not fail.
      if (path.at(-1) === "list" && !answer.startsWith("{")) found.push(`${path.join(" ")}: failed ${answer}`)
    }
    expect(found).toEqual([])
  })
})
