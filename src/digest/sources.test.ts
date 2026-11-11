import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { openStore } from "@wirecat/cli-core/store"
import { afterEach, expect, it } from "vitest"
import { createProgram } from "../program.js"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const PORTAL = { provider: "example-crm", account: "harbour.example.test" }
const CALENDAR = { provider: "google-calendar", account: "owner@example.test" }
const DRIVE = { provider: "google-drive", account: "owner@example.test" }

afterEach(() => {
  process.exitCode = 0
})

const setUp = async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-digest-sources-"))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MESSAGING_STORE: join(root, "s.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
  }
  delete env.MEMO_GROUP
  delete env.MEMO_GROUP_LOCK
  const now = Date.now()
  let driveId = ""
  const store = await openStore({ env })
  try {
    // Each source's own CLI registers its provider on every run; this store has none of them.
    await store.accounts.registerProvider({ name: PORTAL.provider, kind: "crm", aliases: [] })
    await store.accounts.registerProvider({ name: CALENDAR.provider, kind: "events", aliases: [] })

    const drive = await store.notes.documentsAccount(DRIVE, true)
    driveId = String(drive?.id)
    await store.notes.saveFileNote({
      folderId: driveId,
      path: "Harbour/Pier budget.md",
      title: "Pier budget",
      text: "Synthetic budget for the pier.",
    })

    const calendarAccount = await store.accounts.saveAccount(CALENDAR, { name: null })
    const [calendar] = await store.calendar.saveCalendars(
      calendarAccount,
      [
        {
          externalId: "primary",
          title: "Work",
          timezone: "UTC",
          accessRole: "owner",
          primary: true,
          syncByDefault: true,
        },
      ],
      now - 3 * DAY,
    )
    const entry = (externalId: string, title: string, startsAt: number) => ({
      externalId,
      kind: "single" as const,
      status: "confirmed" as const,
      title,
      startsAt,
      endsAt: startsAt + HOUR,
    })
    await store.calendar.saveEntries(
      calendar?.id as number,
      [entry("standup", "Pier standup", now + 3 * HOUR)],
      now - 3 * DAY,
    )
    await store.calendar.saveEntries(calendar?.id as number, [entry("old", "Old review", now - 5 * DAY)], now - 3 * DAY)
    await store.calendar.saveEntries(calendar?.id as number, [entry("kickoff", "Harbour kickoff", now + 5 * DAY)], now)

    await store.accounts.saveAccount(PORTAL, { name: null })
    const stages = [
      { externalId: "new", name: "New", position: 1, outcome: "open" as const },
      { externalId: "quote", name: "Quote", position: 2, outcome: "open" as const },
    ]
    await store.crm.savePipelines(PORTAL, "deal", [{ externalId: "sales", name: "Sales", stages }])
    await store.crm.savePipelines(PORTAL, "lead", [{ externalId: "leads", name: "Leads", stages }])
    const item = (externalId: string, title: string, created: number, updated: number) => ({
      externalId,
      title,
      pipeline: "sales",
      stage: "new",
      createdAt: now - created,
      updatedAt: now - updated,
    })
    await store.crm.saveItems(PORTAL, "deal", [item("d1", "Pier renewal", 10 * DAY, 10 * DAY)], { users: false })
    await store.crm.saveItems(PORTAL, "deal", [{ ...item("d1", "Pier renewal", 10 * DAY, 2 * HOUR), stage: "quote" }], {
      users: false,
    })
    await store.crm.saveItems(PORTAL, "deal", [item("d2", "Quiet ferry deal", 20 * DAY, 9 * DAY)], { users: false })
    await store.crm.saveItems(PORTAL, "lead", [{ ...item("l1", "Dock lead", HOUR, HOUR), pipeline: "leads" }], {
      users: false,
    })
  } finally {
    await store.close()
  }
  const run = async (...args: string[]) => {
    const streams = captureStreams()
    await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
    return streams.stdout.join("")
  }
  return { run, driveId }
}

interface Section {
  name: string
  total: number
  items: { ref: string; why: string; excerpt: string | null }[]
  next: string[]
}

const sectionOf = (answer: { item: { sections: Section[] } }, name: string) =>
  answer.item.sections.find((one) => one.name === name) as Section

it("reads Drive, the calendar and the CRM into parts of their own", async () => {
  const { run, driveId } = await setUp()
  const answer = JSON.parse(await run("review", "agenda", "--since-time", "1d", "--json"))

  const drive = sectionOf(answer, "drive")
  expect(drive.items.map(({ excerpt, why }) => [excerpt, why])).toEqual([["Pier budget", "document changed"]])
  expect(drive.items[0]?.ref).toMatch(/^document:\d+$/)
  // The line a cut section would print, so the agent's follow-up finds the same documents.
  const listed = JSON.parse(await run("search", "notes", "date>1d", "--source", `notes:${driveId}`, "--json"))
  expect(listed.items.map(({ ref }: { ref: string }) => ref)).toEqual([drive.items[0]?.ref])

  const calendar = sectionOf(answer, "calendar")
  expect(calendar.items.map(({ why, excerpt }) => [why, excerpt?.split(" · ")[0]])).toEqual([
    ["starts within a day", "Pier standup"],
    ["event new", "Harbour kickoff"],
  ])

  const crm = sectionOf(answer, "crm")
  expect(crm.items.map(({ why, excerpt }) => [why, excerpt?.split(" — ")[0]])).toEqual([
    ["new lead", "Dock lead"],
    ["deal changed, stage New → Quote", "Pier renewal"],
  ])
})

it("leaves out each part the digest does not read", async () => {
  const { run } = await setUp()
  const answer = JSON.parse(await run("review", "agenda", "--since-time", "1d", "--source", "crm", "--json"))
  expect(sectionOf(answer, "crm").total).toBe(2)
  expect(sectionOf(answer, "drive").total).toBe(0)
  expect(sectionOf(answer, "calendar").total).toBe(0)
})
