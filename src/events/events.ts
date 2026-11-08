import { CliError } from "@wirecat/cli-base"
import { dateRange, dayBoundary, type Predicate, type QueryRegistry, timezoneOf } from "@wirecat/cli-base/query"
import { accountsMeta, type EntryEventType, type EventFilter, type StoredCalendar } from "@wirecat/cli-core/calendar"
import { listQuery, nativeField, nativeTerms, termField, typedQuery } from "@wirecat/cli-core/cli"
import { type EventDetails, eventItem } from "@wirecat/cli-core/meetings"
import { calendarAccounts } from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
import { accountName } from "../store/source-list.js"

const LIST = "events list"

// cli-core 0.613 keeps its own list of these, EVENTS_QUERY and eventsFilter unexported.
const EVENT_TYPES = [
  "default",
  "out-of-office",
  "focus",
  "working-location",
  "birthday",
  "from-mail",
  "call",
] as const satisfies readonly EntryEventType[]

export const EVENTS_QUERY = {
  entity: "event",
  backend: "native",
  fields: [
    nativeField({
      name: "starts_at",
      type: "time",
      operators: ["term", "range"],
      example: "starts_at:[2026-11-02 TO 2026-11-07}",
    }),
    termField("account", "kw", 'account:"phone:pixel"', {
      relation: "one calendar account, provider:account, or every account of a provider",
    }),
    termField("calendar", "kw", "calendar:Calls", { relation: "one calendar, by its id or its title" }),
    termField("event_type", "enum", "event_type:call", {
      values: EVENT_TYPES,
      relation: "events with a copy of this kind; a phone's imported calls are call",
    }),
  ],
} as const satisfies QueryRegistry

/** Recent history matters as much as what comes next: imported calls are all in the past. */
const RECENT_DAYS = 30
const AHEAD_DAYS = 7

export const EVENTS_NOTE =
  `\nEvery calendar account in the store is read, phone imports included. Without starts_at: the last ${RECENT_DAYS} ` +
  `days and the next ${AHEAD_DAYS}. Latest start first.`

/** Whoever sent the invitation or shared the calendar wrote these; a call's title is the name the phone shows. */
const UNTRUSTED = ["title", "description", "location", "in"]

interface ReadAccount {
  id: number
  key: AccountKey
  calendars: StoredCalendar[]
}

const readAccounts = async (store: MessageStore): Promise<ReadAccount[]> => {
  const held = await calendarAccounts(store)
  const stored = await store.accounts.storedAccounts()
  const read: ReadAccount[] = []
  for (const key of held) {
    const one = stored.find(({ provider, account }) => provider === key.provider && account === key.account)
    if (one) read.push({ id: one.id, key, calendars: await store.calendar.calendars(one.id) })
  }
  return read
}

const narrowed = (accounts: readonly ReadAccount[], value: string): ReadAccount[] => {
  const chosen = accounts.filter(({ key }) => accountName(key) === value || key.provider === value)
  if (chosen.length === 0)
    throw new CliError(
      "not_found",
      `account:${value} names no calendar account — the store holds ${accounts.map(({ key }) => accountName(key)).join(", ") || "none"}`,
      { reason: "events.account-unknown" },
    )
  return chosen
}

/** One calendar among the accounts read: a title two accounts share is refused with each one's id, never picked. */
const calendarOf = (accounts: readonly ReadAccount[], value: string) => {
  const all = accounts.flatMap((account) => account.calendars.map((calendar) => ({ account, calendar })))
  const byId = all.filter(({ calendar }) => String(calendar.id) === value)
  const found = byId.length ? byId : all.filter(({ calendar }) => calendar.title === value)
  if (found.length === 1) return found[0] as { account: ReadAccount; calendar: StoredCalendar }
  if (found.length === 0) throw new CliError("not_found", `calendar:${value} names no calendar in the accounts read`)
  throw new CliError(
    "validation_error",
    `calendar:${value} names ${found.length} calendars; give one by its id: ` +
      found.map(({ account, calendar }) => `calendar:${calendar.id} (${accountName(account.key)})`).join(", "),
  )
}

const localDate = (at: number, zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)

const plusDays = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const midnight = (date: string, zone: string) => dayBoundary(date, zone, false, { start: 0, end: date.length })

/** As cli-core's own events list reads a `starts_at` term: from `lower` on, and before `upper`. */
const startsWindow = (node: Predicate, zone: string, now: number) => {
  const range =
    node.operator === "range"
      ? dateRange(
          node.value,
          node.upper ?? "*",
          node.lower_inclusive !== false,
          node.upper_inclusive !== false,
          zone,
          node.span,
          now,
        )
      : dateRange(node.value, node.value, true, true, zone, node.span, now)
  return {
    ...(range.lower === undefined ? {} : { lower: range.lower_inclusive ? range.lower : range.lower + 1 }),
    ...(range.upper === undefined ? {} : { upper: range.upper_inclusive ? range.upper + 1 : range.upper }),
  }
}

/** All-day events have days, not instants: the store compares them by these local days. */
const dated = (filter: EventFilter, zone: string): EventFilter => {
  if (filter.from !== undefined) filter.fromDate = localDate(filter.from, zone)
  if (filter.to !== undefined) filter.toDate = plusDays(localDate(filter.to - 1, zone), 1)
  if (filter.startsFrom !== undefined) {
    const date = localDate(filter.startsFrom, zone)
    filter.startsFromDate = midnight(date, zone) < filter.startsFrom ? plusDays(date, 1) : date
  }
  return filter
}

const windowMeta = (filter: EventFilter, zone: string) => {
  const since = filter.startsFrom ?? filter.from
  return {
    timezone: zone,
    window: {
      ...(since === undefined ? {} : { since: new Date(since).toISOString() }),
      ...(filter.to === undefined ? {} : { until: new Date(filter.to - 1).toISOString() }),
    },
  }
}

const rowOf = (details: EventDetails, accounts: readonly ReadAccount[]) => {
  const live = details.entries.filter(({ deletedAt }) => deletedAt === null)
  const copies = live.length ? live : details.entries
  const held = accounts.flatMap((account) =>
    account.calendars
      .filter(({ id }) => copies.some(({ calendarId }) => calendarId === id))
      .map((calendar) => ({ account: accountName(account.key), calendar: calendar.title ?? String(calendar.id) })),
  )
  return {
    ...eventItem(details.event),
    ref: `event:${details.event.id}`,
    event_type: copies.find(({ eventType }) => eventType !== null)?.eventType ?? "default",
    accounts: [...new Set(held.map(({ account }) => account))],
    in: held.map(({ account, calendar }) => `${account}/${calendar}`).join(", "),
    untrusted: UNTRUSTED,
  }
}

/** `memo events list`: one list over every calendar account the store holds, latest start first. */
export const listEvents = async (
  store: MessageStore,
  words: readonly string[] | string | undefined,
  limit: number,
  { now = Date.now(), zone = timezoneOf() }: { now?: number; zone?: string } = {},
) => {
  const terms = nativeTerms(listQuery(typedQuery(words), EVENTS_QUERY, LIST), LIST)
  const every = await readAccounts(store)
  const account = terms.get("account")
  let accounts = account ? narrowed(every, account.value) : every
  const filter: EventFilter = { newest: true }
  const calendar = terms.get("calendar")
  if (calendar) {
    const found = calendarOf(accounts, calendar.value)
    accounts = [found.account]
    filter.calendarId = found.calendar.id
  }
  const kind = terms.get("event_type")
  if (kind) filter.eventType = kind.value.toLowerCase() as EntryEventType
  const starts = terms.get("starts_at")
  if (starts) {
    const { lower, upper } = startsWindow(starts, zone, now)
    if (lower !== undefined) filter.startsFrom = lower
    if (upper !== undefined) filter.to = upper
  } else {
    const today = localDate(now, zone)
    filter.from = midnight(plusDays(today, -RECENT_DAYS), zone)
    filter.to = midnight(plusDays(today, AHEAD_DAYS + 1), zone)
  }
  dated(filter, zone)
  const read = accounts.map(({ id, key }) => ({ id, key }))
  const events = read.length
    ? await store.calendar.events({ ...filter, accountIds: read.map(({ id }) => id), limit: limit + 1 })
    : []
  const rows = []
  for (const event of events.slice(0, limit)) {
    const details = await store.calendar.event(event.id)
    if (details) rows.push(rowOf(details, accounts))
  }
  const body = listAnswer(LIST, { items: rows, limit, has_more: events.length > limit })
  body.meta = {
    ...body.meta,
    ...(await accountsMeta(store.calendar, read, [], now)),
    ...windowMeta(filter, zone),
  }
  return body
}

/** `memo events show`: one event with its copies in every calendar account the store holds. */
export const showEvent = async (store: MessageStore, reference: string) => {
  const text = reference.replace(/^event:/u, "")
  if (!/^[1-9]\d*$/u.test(text)) throw new CliError("validation_error", "an event is event:<id>")
  const details = await store.calendar.event(Number(text))
  const accounts = await readAccounts(store)
  const row = details && rowOf(details, accounts)
  if (!details || !row?.accounts.length) throw new CliError("not_found", `no event ${text} in any calendar account`)
  return {
    ...row,
    attendees: details.participants.map(({ email, name, response, organizer }) => ({
      email,
      name,
      response,
      organizer,
    })),
    untrusted: [...UNTRUSTED, "attendees.name"],
  }
}

export const accountsLine = (accounts: readonly string[]) =>
  accounts.length ? `calendar accounts read: ${accounts.join(", ")}` : "no calendar account in the store"
