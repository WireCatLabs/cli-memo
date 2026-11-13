import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { expect, it } from "vitest"
import { answerOf } from "../../test/answer.js"
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
    return answerOf(streams.stdout.join(""))
  }
  const preview = await run("vocabulary", "list", "kind:project", "scope:work")
  const added = await run(
    "vocabulary",
    "aliases",
    "add",
    project.ref,
    "Lab Example",
    "--fingerprint",
    preview.fingerprint,
  )
  expect(added).toMatchObject({ changed: true, target: { kind: "project", id: project.id } })
  expect(await run("vocabulary", "show", "LAB EXAMPLE", "--kind", "project")).toMatchObject({
    ambiguous: false,
    matches: [{ id: project.id, name: project.name }],
  })
  await expect(
    run("vocabulary", "aliases", "add", project.ref, "Other Alias", "--fingerprint", preview.fingerprint),
  ).rejects.toMatchObject({ code: "configuration_error" })
  const current = await run("vocabulary", "list", "kind:project")
  expect(
    await run("vocabulary", "aliases", "remove", project.ref, added.alias.id, "--fingerprint", current.fingerprint),
  ).toMatchObject({ changed: true })
  expect((await run("vocabulary", "show", "Lab Example", "--kind", "project")).matches).toEqual([])
  await expect(
    run("vocabulary", "aliases", "add", "person:1", "Wrong", "--fingerprint", current.fingerprint),
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
  expect(answerOf(streams.stdout.join(""))).toMatchObject({
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
  const accountId = await store.accounts.saveAccount(account, { name: "Alice Example" })
  await store.accounts.saveAccount({ provider: "example", account: "BobSample" }, { name: "Bob Sample" })
  const project = await store.knowledge.addProject({ name: "Research Example", key: "RES" })
  await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Lab Example")
  await store.close()
  const { openCache } = await import("@wirecat/cli-core/store")
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
    return answerOf(streams.stdout.join(""))
  }
  const flags = ["--source", `${account.provider}:${account.account}`]
  const acts = ["--account", `${account.provider}:${account.account}`]
  expect(await run("projects", "meetings", "link", "Lab Example", meeting, ...acts)).toMatchObject({
    changed: true,
    link: { project: project.ref, confirmed: true },
  })
  expect(await run("projects", "meetings", "list", "Lab Example", ...flags)).toMatchObject({
    items: [{ project: project.ref, confirmed: true }],
    page: { has_more: false },
  })
  expect((await run("projects", "meetings", "list", "Lab Example", "confirmed:false", ...flags)).items).toEqual([])
  await expect(
    run("projects", "meetings", "link", "Lab Example", meeting, "--account", "example:BobSample"),
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
    return answerOf(streams.stdout.join(""))
  }
  const preview = await run("vocabulary", "check", "on-boarding")
  expect(preview.disposition).toBe("review")
  await expect(
    run("vocabulary", "create", "onboardings", "--fingerprint", preview.creation_fingerprint),
  ).rejects.toMatchObject({ details: { reason: "tag-review.stale" } })
  expect(await run("vocabulary", "create", "on-boarding", "--fingerprint", preview.creation_fingerprint)).toMatchObject(
    {
      name: "on-boarding",
      kind: "tag",
    },
  )
  const old = await run("vocabulary", "check", "delivery", "--kind", "topic")
  const garden = await run("vocabulary", "check", "garden")
  await run("vocabulary", "create", "garden", "--fingerprint", garden.creation_fingerprint)
  await expect(
    run("vocabulary", "create", "delivery", "--kind", "topic", "--fingerprint", old.creation_fingerprint),
  ).rejects.toMatchObject({ details: { reason: "tag-review.stale" } })
  const current = await run("vocabulary", "check", "delivery", "--kind", "topic")
  expect(
    await run("vocabulary", "create", "delivery", "--kind", "topic", "--fingerprint", current.creation_fingerprint),
  ).toMatchObject({ name: "delivery", kind: "topic" })
})

it("reads the vocabulary within the budgets given, in one scope, and pairs only names as close as asked", async () => {
  const env = { ...process.env, MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-vocabulary-budget-")), "f.db") }
  const store = await openStore({ env })
  await store.knowledge.addProject({ name: "Synthetic Rental", key: "REN", scope: "work" })
  await store.knowledge.addProject({ name: "Synthetic Rentals", key: "RNS", scope: "work" })
  await store.knowledge.addProject({ name: "Research Garden", key: "GAR", scope: "personal" })
  await store.knowledge.createTag("onboarding")
  await store.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const entries = "vocabulary exceeds the selected entry budget"
  const bytes = "vocabulary exceeds the selected input byte budget"
  expect((await run("vocabulary", "list", "--max-entries", "4")).entries).toHaveLength(4)
  await expect(run("vocabulary", "list", "--max-entries", "3")).rejects.toThrow(entries)
  await expect(run("vocabulary", "list", "--max-read-bytes", "10")).rejects.toThrow(bytes)

  const garden = ["vocabulary", "show", "Research Garden", "--kind", "project"]
  expect((await run(...garden, "--scope", "personal")).matches).toEqual([
    expect.objectContaining({ name: "Research Garden" }),
  ])
  expect((await run(...garden, "--scope", "work")).matches).toEqual([])
  await expect(run(...garden, "--max-entries", "1")).rejects.toThrow(entries)
  await expect(run(...garden, "--max-read-bytes", "10")).rejects.toThrow(bytes)

  const pairs = async (...args: string[]) => (await run("vocabulary", "check", "--kind", "project", ...args)).pairs
  expect(await pairs("--scope", "work", "--min-similarity", "0.65")).toHaveLength(1)
  expect(await pairs("--scope", "personal", "--min-similarity", "0.65")).toEqual([])
  expect(await pairs("--scope", "work", "--min-similarity", "1")).toEqual([])
  await expect(pairs("--max-entries", "1")).rejects.toThrow(entries)
  await expect(pairs("--max-read-bytes", "10")).rejects.toThrow(bytes)
})

it("confirms an agent's proposed meeting link only with its --fingerprint, keeps a new link's --reason, and pages", async () => {
  const env = {
    ...process.env,
    MESSAGING_STORE: join(mkdtempSync(join(tmpdir(), "memo-project-meeting-test-")), "fixture.db"),
  }
  const store = await openStore({ env })
  const account = { provider: "example", account: "AliceExample" }
  const accountId = await store.accounts.saveAccount(account, { name: "Alice Example" })
  const project = await store.knowledge.addProject({ name: "Research Example", key: "RES" })
  await store.close()
  const { openCache } = await import("@wirecat/cli-core/store")
  const database = await openCache(env.MESSAGING_STORE)
  const meetings: string[] = []
  try {
    for (const external of ["first", "second"])
      meetings.push(
        String(
          database
            .prepare(
              "INSERT INTO meetings(account_id,external_id,title,created_at,updated_at) VALUES (?,?,'Research',1,1) RETURNING id",
            )
            .get(accountId, external)?.id,
        ),
      )
  } finally {
    database.close()
  }
  const proposing = await openStore({ env })
  const proposed = await proposing.knowledge.linkMeetingProject(account, meetings[0] as string, project.id, {
    by: "agent",
  })
  await proposing.close()
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env })
      .exitOverride()
      .parseAsync([...args, "--json"], { from: "user" })
    return answerOf(streams.stdout.join(""))
  }
  const flags = ["--source", `${account.provider}:${account.account}`]
  const link = ["projects", "meetings", "link", "RES", meetings[0] as string, "--account", "example:AliceExample"]
  await expect(run(...link, "--fingerprint", "stale")).rejects.toMatchObject({ code: "configuration_error" })
  expect(
    await run(...link, "--fingerprint", proposed.link.fingerprint, "--reason", "the agenda names the project"),
  ).toMatchObject({ changed: true, link: { confirmed: true } })
  expect(
    await run(
      ...["projects", "meetings", "link", "RES", meetings[1] as string, "--account", "example:AliceExample"],
      "--reason",
      "the title says so",
    ),
  ).toMatchObject({ link: { confirmed: true, provenance: "the title says so" } })

  const first = await run("projects", "meetings", "list", "RES", ...flags, "--limit", "1")
  const second = await run("projects", "meetings", "list", "RES", ...flags, "--limit", "1", "--page", "2")
  expect(first.page).toMatchObject({ has_more: true })
  expect(second.page).toMatchObject({ has_more: false })
  expect([...first.items, ...second.items].map(({ meeting }: { meeting: string }) => meeting).sort()).toEqual(
    meetings.map((id) => `meeting:${accountId}/${id}`).sort(),
  )
})

// cli-core's linkMeetingProject keeps the proposal's provenance when the owner confirms it, so the owner's --reason
// is dropped; a new link keeps it.
it.todo("projects meetings link --fingerprint keeps the owner's --reason when it confirms a proposed link")
