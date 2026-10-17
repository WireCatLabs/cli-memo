import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { beforeAll, expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
import { updateConfig } from "../config.js"
import { createProgram } from "../program.js"

const ME = "owner@example.test"
const OTHER = "other@example.test"
const root = mkdtempSync(join(tmpdir(), "memo-mentions-"))
const env = { ...process.env, MESSAGING_STORE: join(root, "m.db"), MEMO_CONFIG_DIR: join(root, "config") }

const run = async (...args: string[]) => {
  const streams = captureStreams()
  const program = createProgram({ streams, env })
  const quiet = (command: Command) => {
    command.exitOverride()
    command.configureOutput({ writeErr: () => {} })
    for (const child of command.commands) quiet(child)
  }
  quiet(program)
  await program.parseAsync([...args, "--json"], { from: "user" })
  return answerOf(streams.stdout.join(""))
}

const values = async (...args: string[]) =>
  (await run("mentions", "list", ...args)).items.map(({ value }: { value: string }) => value)

beforeAll(async () => {
  updateConfig(
    () => ({
      mail: {
        accounts: [
          { name: "personal", address: ME },
          { name: "work", address: OTHER },
        ],
      },
    }),
    env,
  )
  const store = await openStore({ env })
  await store.notes.addNote({ text: "Call the plumber on +34 600 000 001" })
  const folder = await store.notes.addFolder({ name: "Synthetic folder" })
  await store.notes.saveFileNote({
    folderId: folder.id,
    path: "plan.md",
    title: "Plan",
    text: "See https://example.org/plan",
  })
  for (const [address, phone] of [
    [ME, "+34 600 000 002"],
    [OTHER, "+34 600 000 003"],
  ] as const) {
    const key = { provider: "email", account: address }
    await store.accounts.saveAccount(key, { name: address })
    const account = await store.accounts.storedAccount(key)
    await store.mail.saveThread({
      accountId: account.id,
      externalId: "t1",
      now: Date.parse("2026-10-04T12:00:00Z"),
      emails: [
        {
          externalId: "m1",
          subject: "Visit",
          from: { address: "sender@example.test", name: null },
          sentAt: Date.parse("2026-10-04T12:00:00Z"),
          bodyText: `Ring me at ${phone} before noon`,
        },
      ],
    })
  }
  await store.close()
})

it("lists the mentions of the texts --source names, mail only of the mailboxes named", async () => {
  expect(await values("kind:phone", "--source", "notes")).toEqual(["+34600000001"])
  expect(await values("--source", "documents")).toEqual(expect.arrayContaining(["https://example.org/plan"]))
  expect(await values("kind:phone", "--source", "email:personal")).toEqual(["+34600000002"])
  expect(await values("kind:phone", "--source", `email:personal,email:${OTHER}`)).toHaveLength(2)
  expect(await values("kind:phone", "--source", "email:work,notes")).toHaveLength(2)
  await expect(run("mentions", "list", "--source", "email:nobody")).rejects.toMatchObject({ code: "not_found" })
  await expect(run("mentions", "list", "--source", "telegram")).rejects.toMatchObject({ code: "validation_error" })
})

it("says which mailboxes a read across all of them covered", async () => {
  const listed = await run("mentions", "list", "kind:phone", "--source", "mail")
  expect(listed.items).toHaveLength(2)
  expect([...listed.meta.accounts].sort()).toEqual([`email:${OTHER}`, `email:${ME}`])
})

it("reads a saved account group", async () => {
  const store = await openStore({ env })
  await store.accounts.saveAccountGroup("home", ["email:personal", "notes"])
  await store.close()
  expect(await values("kind:phone", "--source", "group:home")).toEqual(
    expect.arrayContaining(["+34600000001", "+34600000002"]),
  )
})

it("shows a mail mention with its sender as a candidate, then rejects it", async () => {
  const [found] = (await run("mentions", "list", "kind:phone", "--source", "email:personal")).items
  const shown = await run("mentions", "show", String(found.id), "--source", "email:personal")
  expect(shown).toMatchObject({
    written: "+34 600 000 002",
    candidates: expect.any(Array),
    source: { from: expect.any(String) },
  })
  await expect(run("mentions", "show", String(found.id))).rejects.toMatchObject({ code: "not_found" })
  await expect(run("mentions", "show", String(found.id), "--source", "email:work")).rejects.toMatchObject({
    code: "not_found",
  })

  await run("mentions", "reject", String(found.id), "--source", "email:personal", "--as-owner")
  expect(await values("status:dismissed", "--source", "email:personal")).toEqual(["+34600000002"])
})

it("confirms a note's phone as a person's", async () => {
  const store = await openStore({ env })
  const key = { provider: "telegram", account: "1" }
  await store.accounts.saveAccount(key, { name: "synthetic" })
  await store.people.savePeople(key, [{ id: "101", name: "Kai Sample" }])
  const person = await store.people.personOf({ provider: "telegram", id: "101" })
  await store.close()
  const [found] = (await run("mentions", "list", "kind:phone", "--source", "notes")).items
  const decided = await run("mentions", "confirm", String(found.id), `person:${person?.uid}`, "--as-owner")
  expect(decided).toMatchObject({ status: "linked" })
})
