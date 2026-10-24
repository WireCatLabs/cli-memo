import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Message } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeAll, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const message = (id: string, senderId: string, senderName: string): Message => ({
  id,
  chatId: `chat-${senderId}`,
  senderId,
  senderName,
  timestamp: "2026-10-20T08:00:00Z",
  editedAt: null,
  text: "synthetic",
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

let env: NodeJS.ProcessEnv
let stepa: string

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

const refs = (answer: { items: { ref: string }[] }) => answer.items.map(({ ref }) => ref)

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "search-people-"))
  env = { ...process.env, MESSAGING_STORE: join(dir, "m.db"), MEMO_CONFIG_DIR: join(dir, "config") }
  const store = await openStore({ env })
  const tg = { provider: "telegram", account: "1" }
  const max = { provider: "max", account: "2" }
  await store.messages.saveMessages(tg, "chat-101", [message("1", "101", "Степа Stefan Example HARBOUR M&A")], {
    via: "test",
  })
  await store.messages.saveMessages(tg, "chat-102", [message("2", "102", "Rin Sample")], { via: "test" })
  await store.messages.saveMessages(max, "chat-201", [message("3", "201", "Stefan E.")], { via: "test" })
  await store.people.setContactAlias(tg, "102", "Тётя Рина")
  const person = await store.people.linkIdentities(
    { provider: "telegram", id: "101" },
    { provider: "max", id: "201" },
    { method: "manual", by: "test" },
  )
  stepa = `person:${person.uid}`
  await store.close()
})

it("finds a person by part of a Cyrillic display name, whatever the case or ё", async () => {
  for (const word of ["степа", "СТЁПА", "harbour"]) expect(refs(await run("search", "people", word))).toEqual([stepa])
})

it("finds a person by the owner's alias", async () => {
  const answer = await run("search", "people", "тетя")
  expect(answer.items).toHaveLength(1)
  expect(answer.items[0]).toMatchObject({ name: "Rin Sample", aliases: ["Тётя Рина"] })
})

it("reads every account by default and says which", async () => {
  const answer = await run("search", "people", "stefan")
  expect(answer.meta.accounts).toEqual(expect.arrayContaining(["telegram:1", "max:2"]))
  expect(refs(answer)).toEqual([stepa])
  expect(answer.items[0].identities.map(({ provider }: { provider: string }) => provider).sort()).toEqual([
    "max",
    "telegram",
  ])
})

it("says when --limit leaves people out", async () => {
  const answer = await run("search", "people", "s", "--limit", "1")
  expect(answer.items).toHaveLength(1)
  expect(answer.page.has_more).toBe(true)
})

it("narrows to the accounts --source names", async () => {
  const answer = await run("search", "people", "stefan", "--source", "max")
  expect(answer.meta.accounts).toEqual(["max:2"])
  expect(answer.items[0].identities).toEqual([
    { provider: "max", account: "2", id: "201", name: "Stefan E.", username: null, alias: null },
  ])
  expect((await run("search", "people", "harbour", "--source", "max")).items).toEqual([])
})
