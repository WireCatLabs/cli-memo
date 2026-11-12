import { isFolderProvider, kindIn } from "@wirecat/cli-core"
import { eventChange } from "@wirecat/cli-core/meetings"
import { searchNotesQuery } from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"

/** A part of the agenda read from the store alone: items newest first, cut by the agenda's section limit. */
export interface SourcePart {
  found: { item: SourceItem; fill?: () => Promise<Partial<SourceItem>> }[]
  next: string[]
}

interface SourceItem {
  ref: string
  who: string | null
  at: string
  excerpt: string | null
  why: string
}

interface Window {
  since: number
  now: number
  excerpt: number
}

const DAY = 86_400_000
/** Rows read per part before the section limit: the same bound the meetings part reads. */
const READ = 100
/** The deals list is newest created first, so a deal changed today may sit deep in it; this many are read at most. */
const CRM_READ = 500

const iso = (ms: number) => new Date(ms).toISOString()
const oneLine = (text: string | null | undefined, size: number): string | null => {
  const flat = (text ?? "").replace(/\s+/g, " ").trim()
  if (!flat) return null
  return flat.length > size ? `${flat.slice(0, size - 1)}…` : flat
}
const days = ({ since, now }: Window) => `${Math.max(1, Math.ceil((now - since) / DAY))}d`
const name = (key: AccountKey) => `${key.provider}:${key.account}`

export const isDriveAccount = (provider: string) =>
  !isFolderProvider(provider) && (provider === "google-drive" || kindIn(provider) === "documents")
export const isCalendarAccount = (provider: string) => kindIn(provider) === "events"
export const isCrmAccount = (provider: string) => kindIn(provider) === "crm"

/** Drive documents whose last edit falls in the window, from the accounts drive-cli keeps in the store. */
export const driveChanges = async (store: MessageStore, accounts: readonly AccountKey[], window: Window) => {
  const held = new Set(accounts.filter((key) => isDriveAccount(key.provider)).map(name))
  const folders = (await store.notes.documentsAccounts()).filter((folder) =>
    held.has(folder.account ? name(folder.account) : folder.name),
  )
  if (folders.length === 0) return { found: [], next: [] }
  const hits = await searchNotesQuery(store, {
    text: `date>${days(window)}`,
    limit: READ,
    newest: true,
    folderIds: folders.map((folder) => folder.id),
    withInternal: false,
  })
  const found = hits.items
    .filter((hit) => Date.parse(hit.at) >= window.since && Date.parse(hit.at) <= window.now)
    .map((hit) => ({
      item: {
        ref: hit.ref,
        who: null,
        at: hit.at,
        excerpt: oneLine(hit.note.title ?? hit.note.path, window.excerpt),
        why: "document changed",
      },
    }))
  return {
    found,
    next: [
      ...folders.map((folder) => `memo search notes 'date>${days(window)}' --source notes:${folder.id}`),
      ...(hits.hasMore ? [`# more than ${READ} documents changed; the newest ${READ} were read`] : []),
    ],
  }
}

/**
 * Calendar events that were added, moved or cancelled in the window, and those starting in the day ahead. Phone calls
 * are events too, but their account is a messenger's, so they never come in here.
 */
export const calendarChanges = async (store: MessageStore, accounts: readonly AccountKey[], window: Window) => {
  const keys = accounts.filter((key) => isCalendarAccount(key.provider))
  if (keys.length === 0) return { found: [], next: [] }
  const accountIds = await Promise.all(keys.map(async (key) => (await store.accounts.storedAccount(key)).id))
  const calendarIds = (await Promise.all(accountIds.map((id) => store.calendar.calendars(id)))).flat().map((c) => c.id)
  const changed = await store.calendar.events({ accountIds, changedSince: window.since, limit: READ })
  const history = changed.length
    ? await store.calendar.historyOf(
        changed.map((event) => event.id),
        calendarIds,
        window.since,
      )
    : { entries: [], revisions: [] }
  const found: SourcePart["found"] = []
  const seen = new Set<number>()
  for (const event of changed) {
    const entries = history.entries.filter((entry) => entry.eventId === event.id)
    const ids = new Set(entries.map((entry) => entry.id))
    const change = eventChange(
      event,
      entries,
      history.revisions.filter((revision) => ids.has(revision.entryId)),
      window.since,
    )
    if (change === null || change.at > window.now) continue
    seen.add(event.id)
    const starts = event.startsAt === null ? "" : ` · starts ${iso(event.startsAt)}`
    const was = change.was?.startsAt == null ? "" : `, was ${iso(change.was.startsAt)}`
    found.push({
      item: {
        ref: `event:${event.id}`,
        who: null,
        at: iso(change.at),
        excerpt: oneLine(`${event.title ?? "untitled"}${starts}`, window.excerpt),
        why: `event ${change.change}${was}`,
      },
    })
  }
  const ahead = await store.calendar.events({ accountIds, startsFrom: window.now, to: window.now + DAY, limit: READ })
  for (const event of ahead) {
    if (seen.has(event.id) || event.startsAt === null || event.status === "cancelled") continue
    found.push({
      item: {
        ref: `event:${event.id}`,
        who: null,
        at: iso(event.startsAt),
        excerpt: oneLine(event.title ?? "untitled", window.excerpt),
        why: "starts within a day",
      },
    })
  }
  return {
    found,
    next: [
      "memo events list --json",
      ...(changed.length >= READ ? [`# more than ${READ} events changed; ${READ} were read`] : []),
    ],
  }
}

/** Deals and leads of the CRM copies that the CRM changed in the window; a stage moved in it is named. */
export const crmChanges = async (store: MessageStore, accounts: readonly AccountKey[], window: Window) => {
  const keys = accounts.filter((key) => isCrmAccount(key.provider))
  if (keys.length === 0) return { found: [], next: [] }
  const found: SourcePart["found"] = []
  const next: string[] = []
  for (const kind of ["deal", "lead"] as const) {
    const { items: rows, hasMore } = await store.deals.list({ kind, accounts: keys, limit: CRM_READ })
    if (hasMore) next.push(`# the newest ${CRM_READ} ${kind}s were read; an older one changed is left out`)
    let here = 0
    for (const row of rows) {
      const updated = Date.parse(row.updatedAt)
      if (row.account === null || updated < window.since || updated > window.now) continue
      here++
      const created = Date.parse(row.createdAt) >= window.since
      found.push({
        item: {
          ref: row.ref,
          who: row.organization?.name ?? null,
          at: row.updatedAt,
          excerpt: oneLine(`${row.title} — ${row.summary}`, window.excerpt),
          why: created ? `new ${kind}` : `${kind} changed`,
        },
        fill: async () => {
          const moved = (await store.deals.stages(row.ref)).filter(
            (one) => one.from !== null && Date.parse(one.at) >= window.since && Date.parse(one.at) <= window.now,
          )
          const last = moved.at(-1)
          return last ? { why: `${created ? `new ${kind}` : `${kind} changed`}, stage ${last.from} → ${last.to}` } : {}
        },
      })
    }
    if (here) next.push(`memo ${kind}s list --json`)
  }
  return { found, next }
}
