import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import type { Chat } from "@wirecat/cli-core"
import { openStore } from "@wirecat/cli-core/store"
import { beforeEach, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { createProgram } from "../program.js"

const tg = { provider: "telegram", account: "1" }
const chat: Chat = {
  id: "101",
  title: "Owner Example",
  kind: "dialog",
  unreadCount: null,
  lastMessageAt: "2026-09-10T08:00:00Z",
  participantsCount: 2,
}

let env: NodeJS.ProcessEnv

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

const markOwner = async () => {
  const store = await openStore({ env })
  const owner = await store.people.linkToOwner({ provider: "telegram", id: "101" })
  await store.close()
  return owner.uid
}

beforeEach(async () => {
  env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-owner-")), "fixture.db") }
  const store = await openStore({ env })
  await store.sync.applyDelta(tg, { chats: [chat], people: [{ id: "101", name: "Owner Example" }] })
  await store.close()
})

it("reads person:me as the person marked as the owner, in context and in a relationship", async () => {
  const uid = await markOwner()
  const project = await run("projects", "add", "Research Example", "--key", "RES")

  expect((await run("context", "person:me")).messages.person.uid).toBe(uid)
  expect(await run("relationships", "add", "person:me", project.ref, "--role", "lead")).toMatchObject({
    from: `person:${uid}`,
    to: project.ref,
  })
})

it("says how to mark the owner when no person is", async () => {
  const project = await run("projects", "add", "Research Example", "--key", "RES")

  await expect(run("context", "person:me")).rejects.toThrow(/no person is marked as you.*contacts link <your id> me/)
  await expect(run("relationships", "add", "person:me", project.ref)).rejects.toThrow(/no person is marked as you/)
})
