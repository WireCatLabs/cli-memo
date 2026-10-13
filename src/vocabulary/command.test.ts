import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-messaging/store"
import { expect, it } from "vitest"
import { createProgram } from "../program.js"

it("resolves owner project aliases through reviewed CLI writes and rejects a stale fingerprint", async () => {
  const env = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-vocabulary-test-")), "fixture.db"),
  }
  const store = await openStore({ env })
  const project = await store.knowledge.addProject({ name: "Research Example", key: "RES", scope: "work" })
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  const preview = await run("vocabulary", "list", "--kind", "project", "--scope", "work")
  const added = await run("vocabulary", "aliases", "add", project.ref, "Lab Example", "--expected", preview.fingerprint)
  expect(added).toMatchObject({ changed: true, target: { kind: "project", id: project.id } })
  expect(await run("vocabulary", "show", "LAB EXAMPLE", "--kind", "project")).toMatchObject({
    ambiguous: false,
    matches: [{ id: project.id, name: project.name }],
  })
  await expect(
    run("vocabulary", "aliases", "add", project.ref, "Other Alias", "--expected", preview.fingerprint),
  ).rejects.toMatchObject({ code: "configuration_error" })
  const current = await run("vocabulary", "list", "--kind", "project")
  expect(
    await run("vocabulary", "aliases", "remove", project.ref, added.alias.id, "--expected", current.fingerprint),
  ).toMatchObject({ changed: true })
  expect((await run("vocabulary", "show", "Lab Example", "--kind", "project")).matches).toEqual([])
  await expect(
    run("vocabulary", "aliases", "add", "person:1", "Wrong", "--expected", current.fingerprint),
  ).rejects.toMatchObject({ code: "validation_error" })
})
it("returns likely label duplicates without changing the catalog", async () => {
  const env = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-label-preflight-test-")), "fixture.db"),
  }
  const store = await openStore({ env })
  await store.knowledge.createTag("onboarding")
  await store.close()
  const streams = captureStreams()
  await createProgram({ streams, env })
    .exitOverride()
    .parseAsync(["vocabulary", "check", "on-boarding", "--json"], { from: "user" })
  expect(JSON.parse(streams.stdout.join(""))).toMatchObject({
    disposition: "review",
    existing: null,
    suggestions: [{ entry: { name: "onboarding" } }],
  })
  const reopened = await openStore({ env })
  try {
    expect((await reopened.knowledge.vocabulary({ kind: "tag" })).entries).toHaveLength(1)
  } finally {
    await reopened.close()
  }
})
it("selects project meetings through aliases and refuses a foreign account link", async () => {
  const env = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-project-meeting-test-")), "fixture.db"),
  }
  const store = await openStore({ env })
  const account = { provider: "example", account: "AliceExample" }
  const accountId = await store.saveAccount(account, { name: "Alice Example" })
  await store.saveAccount({ provider: "example", account: "BobSample" }, { name: "Bob Sample" })
  const project = await store.knowledge.addProject({ name: "Research Example", key: "RES" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Lab Example")
  await store.close()
  const { openCache } = await import("@wirecat/cli-messaging/store")
  const database = await openCache(env.MESSAGING_STORE)
  let meeting: string
  try {
    const row = database
      .prepare(
        "INSERT INTO meetings(account_id,external_id,title,created_at,updated_at) VALUES (?,'fixture','Research Example',1,1) RETURNING id",
      )
      .get(accountId)
    meeting = String(row?.id)
  } finally {
    database.close()
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  const flags = ["--provider", account.provider, "--account", account.account]
  expect(await run("projects", "meetings", "link", "Lab Example", meeting, ...flags)).toMatchObject({
    changed: true,
    link: { project: project.ref, confirmed: true },
  })
  expect(await run("projects", "meetings", "list", "Lab Example", ...flags)).toMatchObject({
    items: [{ project: project.ref, confirmed: true }],
    hasMore: false,
  })
  await expect(
    run("projects", "meetings", "link", "Lab Example", meeting, "--provider", "example", "--account", "BobSample"),
  ).rejects.toMatchObject({ code: "not_found" })
})

it("creates an owner-reviewed distinct label and rejects a stale creation receipt", async () => {
  const env = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-label-create-test-")), "fixture.db"),
  }
  const store = await openStore({ env })
  await store.knowledge.createTag("onboarding")
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return JSON.parse(streams.stdout.join(""))
  }
  const preview = await run("vocabulary", "check", "on-boarding")
  expect(preview.disposition).toBe("review")
  await expect(
    run("vocabulary", "create", "onboardings", "--expected", preview.creationFingerprint),
  ).rejects.toMatchObject({ details: { reason: "stale_tag_review" } })
  expect(await run("vocabulary", "create", "on-boarding", "--expected", preview.creationFingerprint)).toMatchObject({
    name: "on-boarding",
    kind: "tag",
  })
  const old = await run("vocabulary", "check", "delivery", "--kind", "topic")
  const garden = await run("vocabulary", "check", "garden")
  await run("vocabulary", "create", "garden", "--expected", garden.creationFingerprint)
  await expect(
    run("vocabulary", "create", "delivery", "--kind", "topic", "--expected", old.creationFingerprint),
  ).rejects.toMatchObject({ details: { reason: "stale_tag_review" } })
  const current = await run("vocabulary", "check", "delivery", "--kind", "topic")
  expect(
    await run("vocabulary", "create", "delivery", "--kind", "topic", "--expected", current.creationFingerprint),
  ).toMatchObject({ name: "delivery", kind: "topic" })
})
