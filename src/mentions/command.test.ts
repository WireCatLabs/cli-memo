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

it("lists the mentions of notes and documents, and mail only of the accounts named", async () => {
  expect(await values("note", "kind:phone")).toEqual(["+34600000001"])
  expect(await values("document")).toEqual(expect.arrayContaining(["https://example.org/plan"]))
  expect(await values("email", "kind:phone", "--account", "personal")).toEqual(["+34600000002"])
  expect(await values("email", "kind:phone", "--account", "personal", "--account", OTHER)).toHaveLength(2)
  await expect(run("mentions", "list", "email")).rejects.toMatchObject({
    code: "validation_error",
    message: expect.stringContaining("personal, work"),
  })
})

it("shows a mail mention with its sender as a candidate, then rejects it", async () => {
  const [found] = (await run("mentions", "list", "email", "kind:phone", "--account", "personal")).items
  const shown = await run("mentions", "show", String(found.id), "--account", "personal")
  expect(shown).toMatchObject({
    written: "+34 600 000 002",
    candidates: expect.any(Array),
    source: { from: expect.any(String) },
  })
  await expect(run("mentions", "show", String(found.id))).rejects.toMatchObject({ code: "not_found" })
  await expect(run("mentions", "show", String(found.id), "--account", "work")).rejects.toMatchObject({
    code: "not_found",
  })

  await run("mentions", "reject", String(found.id), "--account", "personal", "--as-owner")
  expect(await values("email", "status:dismissed", "--account", "personal")).toEqual(["+34600000002"])
})

it("confirms a note's phone as a person's", async () => {
  const store = await openStore({ env })
  const key = { provider: "telegram", account: "1" }
  await store.accounts.saveAccount(key, { name: "synthetic" })
  await store.people.savePeople(key, [{ id: "101", name: "Kai Sample" }])
  const person = await store.people.personOf({ provider: "telegram", id: "101" })
  await store.close()
  const [found] = (await run("mentions", "list", "note", "kind:phone")).items
  const decided = await run("mentions", "confirm", String(found.id), `person:${person?.uid}`, "--as-owner")
  expect(decided).toMatchObject({ status: "linked" })
})
