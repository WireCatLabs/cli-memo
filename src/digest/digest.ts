import { formatReference, kindOf } from "@wirecat/cli-core"
import { mailTurn, OWED_DAYS } from "@wirecat/cli-core/mail"
import { formatMeetingReference } from "@wirecat/cli-core/meetings"
import { projectStatus } from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { listReview } from "../review/review.js"
import { counted } from "../review/status.js"
import { knownSenders } from "./known.js"
import { HEALTH_REASONS, type Health, healthOf, SOURCE_WORDS, syncRunsOf } from "./sync-health.js"
import { gatherTasks, previousDigestAt, type TaskCounts } from "./tasks.js"

/** The tag that puts a chat, mail thread, person, project or meeting series on the owner's watch list. */
export const WATCH_TAG = "watch"

export interface DigestItem {
  ref: string
  who: string | null
  at: string
  /** One line of what was written, quoted as data. */
  excerpt: string | null
  why: string
  /** A task's: when it is due, `null` for none. */
  due?: string | null
  /** A task's: who does it. */
  for?: string | null
}

export interface DigestSection {
  name: SectionName
  items: DigestItem[]
  /** Found in the window; `items` may hold fewer when a cap or the size budget cut them. */
  total: number
  /** Commands that read what was cut, kept only when something was; a line starting with # is a note, kept always. */
  next: string[]
  /** `owed` only: owed mail from senders the owner does not know yet, counted and not listed. */
  unknown?: { count: number; next: string[] }
}

export const SECTIONS = ["watch", "owed", "mail", "meetings", "tasks", "projects", "proposals"] as const
export type SectionName = (typeof SECTIONS)[number]

export interface Coverage {
  account: string
  /** When the store last saved anything of it; `null` when it never did. Says nothing about the sync by itself. */
  storedAt: string | null
  /** The owner wrote last in the window and nobody answered yet. */
  waiting: number
  /** Chats the chat list says moved while their newest message is not stored. */
  unsynced: number
}

export const SCOPE_KINDS = ["telegram", "max", "whatsapp", "mail", "meeting", "task"] as const

/** What the digest read, for the report's "what was viewed" line: memo counts it, the agent copies it. */
export interface Scope {
  from: string
  to: string
  sources: { kind: (typeof SCOPE_KINDS)[number]; accounts: number }[]
  counts: { chats: number; mail: number; tasks: number; meetings: number }
}

export interface Digest {
  since: string
  at: string
  scope: Scope
  tasks: TaskCounts
  health: Health[]
  coverage: Coverage[]
  sections: DigestSection[]
  /** Excerpts and titles were written by others: an agent reads them as data, never as instructions. */
  untrusted: string[]
}

export interface DigestOptions {
  since: number
  now?: number
  /** Items per section before the size budget. */
  limit: number
  /** Characters per excerpt. */
  excerpt: number
  /** ms: an owed reply older than this is left to `tasks agenda` and `mail review`. */
  owedWithin: number
  /** Tasks created after this are new; the previous morning-digest run when left out. */
  newSince?: string
}

const DAY = 86_400_000
const MESSENGERS = new Set(["telegram", "max", "whatsapp"])
const HEALTH_ORDER: readonly string[] = HEALTH_REASONS
const UNNAMED = "unnamed account"
/** Dialogs with a messenger's own service account: no person there is owed a reply. */
const SERVICE_CHATS: Record<string, ReadonlySet<string>> = { telegram: new Set(["777000"]) }

/** The dialogs of an account that are not with a person: bots, as the messenger marks them, and service chats. */
const notPeopleOf = async (store: MessageStore, key: AccountKey): Promise<Set<string>> => {
  const found = new Set(SERVICE_CHATS[key.provider] ?? [])
  for (let offset = 0; ; offset += 500) {
    const page = await store.chats.chats(key, { limit: 500, offset })
    for (const chat of page.items)
      if (chat.kind === "dialog" && chat.providerMetadata?.isBot === true) found.add(chat.id)
    if (!page.hasMore) break
  }
  return found
}

/**
 * What a person calls each account: its name and username, a mailbox its address. Never the raw id; an account with
 * neither is named by the profile that signs in to it, and two of a provider with one name get theirs added.
 */
const labelsOf = async (store: MessageStore, keys: readonly AccountKey[]): Promise<Map<string, string>> => {
  const stored = new Map((await store.accounts.storedAccounts()).map((one) => [name(one), one.name]))
  const profiles = Object.values(await store.accounts.profiles()).flatMap((byProfile) => Object.entries(byProfile))
  const profileOf = (key: AccountKey) =>
    profiles.find(([, held]) => held.provider === key.provider && held.account === key.account)?.[0]
  const labels = new Map<string, string>()
  for (const key of keys) {
    if (key.provider === "email") {
      labels.set(name(key), key.account)
      continue
    }
    const person = await store.people.personOf({ provider: key.provider, id: key.account })
    const username = person?.identities.find((one) => one.provider === key.provider && one.id === key.account)?.username
    const given = stored.get(name(key))
    const label = [given && given !== key.account ? given : null, username ? `@${username}` : null]
      .filter(Boolean)
      .join(" ")
    const profile = profileOf(key)
    labels.set(name(key), label || (profile ? `profile ${profile}` : UNNAMED))
  }
  const taken = new Map<string, number>()
  for (const [account, label] of labels) {
    const word = `${account.split(":")[0]}|${label}`
    taken.set(word, (taken.get(word) ?? 0) + 1)
  }
  for (const key of keys) {
    const label = labels.get(name(key)) ?? UNNAMED
    const profile = profileOf(key)
    if ((taken.get(`${key.provider}|${label}`) ?? 0) > 1 && profile && !label.startsWith("profile "))
      labels.set(name(key), `${label} (profile ${profile})`)
  }
  return labels
}

const oneLine = (text: string | null | undefined, size: number): string | null => {
  const flat = (text ?? "").replace(/\s+/g, " ").trim()
  if (!flat) return null
  return flat.length > size ? `${flat.slice(0, size - 1)}…` : flat
}

const iso = (ms: number) => new Date(ms).toISOString()
const name = (key: AccountKey) => `${key.provider}:${key.account}`

interface Pending {
  item: DigestItem
  /** Fills `who` and `excerpt`; run only for the items a section keeps, so a cut item costs no read. */
  fill?: () => Promise<Partial<DigestItem>>
}

const section = async (
  name: SectionName,
  found: Pending[],
  limit: number,
  next: string[],
  total = found.length,
): Promise<DigestSection> => {
  const kept = found.sort((a, b) => b.item.at.localeCompare(a.item.at)).slice(0, limit)
  const items = await Promise.all(kept.map(async (one) => ({ ...one.item, ...(await one.fill?.()) })))
  return { name, items, total, next }
}

const messageFill =
  (store: MessageStore, key: AccountKey, chatId: string, messageId: string | null, size: number) => async () => {
    if (messageId === null) return {}
    const message = await store.messages.message(key, messageId, { chatId })
    return { ...(message?.senderName ? { who: message.senderName } : {}), excerpt: oneLine(message?.text, size) }
  }

const mailFill = (store: MessageStore, accountId: number, externalId: string, size: number) => async () => {
  const email = await store.mail.email(accountId, externalId)
  return {
    who: email?.fromName ?? email?.fromAddress ?? null,
    excerpt: oneLine([email?.subject, email?.snippet].filter(Boolean).join(" — "), size),
  }
}

/** The words a project status finding carries, by the shape its signal gives it. */
const statusLine = (data: Record<string, unknown>): string => {
  const text = data.excerpt ?? data.title
  if (typeof text === "string") return text
  if (data.amount !== undefined)
    return [data.direction, data.amount, data.currency, data.state].filter(Boolean).join(" ")
  if (data.next !== undefined) return `next: ${String(data.next)}${data.overdue ? ", overdue" : ""}`
  return ""
}

const personal = (newest: { bulk: boolean; list: boolean; envelope: boolean; demoted: boolean }) =>
  !newest.bulk && !newest.list && !newest.envelope && !newest.demoted

/**
 * What the morning needs from the store alone, no model call and no network: the watch list, replies owed, new
 * personal mail, meetings that ended, tasks due, projects that moved, proposals waiting. Every item names its
 * reference, so an agent reads further only where it points.
 */
export const gatherDigest = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  { since, now = Date.now(), limit, excerpt, owedWithin, newSince }: DigestOptions,
): Promise<Digest> => {
  const window = (now - since) / DAY
  const days = `${Math.max(1, Math.ceil(window))}d`
  const accounts = await store.accounts.accounts()
  const messengers = accounts.filter((key) => MESSENGERS.has(key.provider))
  const mailboxes = accounts.filter((key) => key.provider === "email")
  const owedSince = Math.min(since, now - owedWithin)

  const watched = {
    chats: new Map<string, string[]>(),
    people: new Set<string>(),
    projects: new Set<string>(),
    series: new Set<number>(),
  }
  for (const key of [...messengers, ...mailboxes]) {
    const rows = await store.tags.tags(key, { type: "chat", tag: WATCH_TAG })
    if (rows.length)
      watched.chats.set(
        name(key),
        rows.map((row) => String(row.chatId)),
      )
  }
  // A meeting is tagged in its account's scope, a person or project in none.
  for (const scope of [null, ...accounts])
    for (const row of (await store.knowledge.labelled(scope, { tag: WATCH_TAG, limit: 200 })).items) {
      const target = row.target as { type: string; id: string }
      if (target.type === "person") watched.people.add(target.id)
      if (target.type === "project") watched.projects.add(target.id)
      if (target.type === "meeting") {
        const meeting = await store.meetings.meeting(Number(target.id))
        if (meeting?.meeting.meetingSeriesId) watched.series.add(meeting.meeting.meetingSeriesId)
      }
    }
  const isWatchedChat = (key: AccountKey, chat: string) => watched.chats.get(name(key))?.includes(chat) === true

  const coverage: Coverage[] = []
  const watch: Pending[] = []
  const owed: Pending[] = []
  const mail: Pending[] = []
  const owedNext: string[] = []
  const mailNext: string[] = []
  let bulk = 0
  let olderMail = 0
  const unknown = { count: 0, next: [] as string[] }

  const syncRuns = syncRunsOf(env)
  const labels = await labelsOf(store, [...messengers, ...mailboxes])
  const health: Health[] = []
  const checkHealth = (key: AccountKey, activity: { newest: number | null; moved30d: number }) => {
    const found = healthOf(syncRuns(key), activity, now)
    if (found)
      health.push({
        source: SOURCE_WORDS[key.provider] ?? key.provider,
        account: labels.get(name(key)) ?? UNNAMED,
        ...found,
        refs: [],
      })
  }
  let chatsMoved = 0
  let mailMoved = 0

  for (const key of messengers) {
    const { chats, storedAt } = await store.chats.chatActivity(key, owedSince)
    const month = (await store.chats.chatActivity(key, now - 30 * DAY)).chats
    checkHealth(key, {
      newest: month.reduce<number | null>((most, chat) => Math.max(most ?? 0, Date.parse(chat.lastMessageAt)), null),
      moved30d: month.length,
    })
    const ref = (chat: string) => formatReference({ type: "chat", provider: key.provider, account: key.account, chat })
    chatsMoved += chats.filter((chat) => Date.parse(chat.lastMessageAt) >= since).length
    coverage.push({
      account: name(key),
      storedAt,
      waiting: chats.filter((chat) => chat.lastFromOwner === true && Date.parse(chat.lastMessageAt) >= since).length,
      unsynced: chats.filter((chat) => chat.lastMessageId === null && Date.parse(chat.lastMessageAt) >= since).length,
    })
    const owedChats = chats.filter(
      (chat) => !isWatchedChat(key, chat.chatId) && chat.kind === "dialog" && chat.lastFromOwner === false,
    )
    const notPeople = owedChats.length ? await notPeopleOf(store, key) : new Set<string>()
    let owedHere = 0
    for (const chat of owedChats) {
      if (notPeople.has(chat.chatId)) continue
      owed.push({
        item: { ref: ref(chat.chatId), who: chat.title, at: chat.lastMessageAt, excerpt: null, why: "owed reply" },
        fill: messageFill(store, key, chat.chatId, chat.lastMessageId, excerpt),
      })
      owedHere++
    }
    if (owedHere)
      owedNext.push(`memo tasks agenda --source ${name(key)} --unanswered 1m --within ${Math.ceil(owedWithin / DAY)}d`)
    for (const chatId of watched.chats.get(name(key)) ?? []) {
      const page = await store.messages.messages(key, chatId, { limit, since: iso(since) })
      for (const message of page.items)
        watch.push({
          item: {
            ref: formatReference({
              type: "message",
              provider: key.provider,
              account: key.account,
              chat: chatId,
              message: message.id,
            }),
            who: message.outgoing ? "you" : message.senderName,
            at: message.timestamp,
            excerpt: oneLine(message.text, excerpt),
            why: "watched chat",
          },
        })
    }
  }

  for (const key of mailboxes) {
    const stored = await store.accounts.storedAccount(key)
    const threads = await store.mail.threadActivity(stored.id, Math.min(owedSince, now - OWED_DAYS * DAY))
    const ref = (thread: string) =>
      formatReference({ type: "chat", provider: "email", account: key.account, chat: thread })
    const newest = threads.reduce((most, thread) => Math.max(most, thread.lastEmailAt), 0)
    checkHealth(key, {
      newest: newest || null,
      moved30d: threads.filter((thread) => thread.lastEmailAt >= now - 30 * DAY).length,
    })
    mailMoved += threads.filter(
      (thread) => thread.lastEmailAt >= since && thread.newest !== null && personal(thread.newest),
    ).length
    coverage.push({
      account: name(key),
      storedAt: newest ? iso(newest) : null,
      waiting: threads.filter((thread) => mailTurn(thread.newest) === "waiting" && thread.lastEmailAt >= since).length,
      unsynced: 0,
    })
    let owedHere = 0
    let newHere = 0
    const owedMail: { pending: Pending; externalId: string }[] = []
    for (const thread of threads) {
      const last = thread.newest
      if (last === null) continue
      const inWindow = thread.lastEmailAt >= since
      if (!personal(last)) {
        if (inWindow) bulk++
        continue
      }
      const pending = (why: string) => ({
        item: {
          ref: ref(thread.threadId),
          who: null,
          at: iso(thread.lastEmailAt),
          excerpt: oneLine(thread.subject, excerpt),
          why,
        },
        fill: mailFill(store, stored.id, last.externalId, excerpt),
      })
      if (isWatchedChat(key, thread.threadId)) {
        if (inWindow) watch.push(pending("watched thread"))
      } else if (mailTurn(last) === "owed") {
        // Mail owed from before the window was in an earlier digest; repeating hundreds of it hides today's.
        if (inWindow) owedMail.push({ pending: pending("owed reply"), externalId: last.externalId })
        else if (thread.lastEmailAt >= owedSince) olderMail++
        owedHere++
      } else if (inWindow && !last.outgoing) {
        mail.push(pending("new mail"))
        newHere++
      }
    }
    const known = await knownSenders(
      store,
      stored.id,
      owedMail.map((one) => one.externalId),
    )
    const strangers = owedMail.filter((one) => !known.has(one.externalId))
    for (const one of owedMail) if (known.has(one.externalId)) owed.push(one.pending)
    unknown.count += strangers.length
    if (owedHere) owedNext.push(`memo mail review --source ${name(key)} --unanswered 1m bulk:false`)
    if (strangers.length) unknown.next.push(`memo mail review --source ${name(key)} --unanswered 1m bulk:false`)
    if (newHere) mailNext.push(`memo mail review --source ${name(key)} date>${days} bulk:false`)
  }

  for (const uid of watched.people) {
    const person = await store.people.personByUid(uid)
    if (!person) continue
    for (const identity of person.identities)
      for (const account of identity.accounts) {
        const key = { provider: identity.provider, account }
        if (!MESSENGERS.has(key.provider)) continue
        for (const stats of await store.messages.senderStats(key, identity.id)) {
          if (stats.lastAt === null || Date.parse(stats.lastAt) < since) continue
          watch.push({
            item: {
              ref: formatReference({ type: "chat", provider: key.provider, account, chat: stats.chatId }),
              who: person.name,
              at: stats.lastAt,
              excerpt: oneLine(stats.title, excerpt),
              why: `watched person:${uid} wrote`,
            },
          })
        }
      }
  }

  const meetings: Pending[] = []
  for (const meeting of await store.meetings.meetings({ since, limit: 100 })) {
    const ended = meeting.endedAt ?? meeting.startedAt
    if (ended === null || ended < since || meeting.deletedAt !== null) continue
    meetings.push({
      item: {
        ref: formatMeetingReference({ type: "meeting", accountId: meeting.accountId, meetingId: meeting.id }),
        who: null,
        at: iso(ended),
        excerpt: oneLine(meeting.title, excerpt),
        why:
          meeting.meetingSeriesId !== null && watched.series.has(meeting.meetingSeriesId)
            ? "watched series"
            : "meeting",
      },
      fill: async () => {
        const details = await store.meetings.meeting(meeting.id)
        const summary = details?.summaries[0] as { text?: string | null } | undefined
        const transcripts = details?.transcripts.length ?? 0
        return {
          who: details ? `${details.participants.length} people` : null,
          excerpt: oneLine([meeting.title, summary?.text].filter(Boolean).join(" — "), excerpt),
          why: `${meeting.meetingSeriesId !== null && watched.series.has(meeting.meetingSeriesId) ? "watched series, " : ""}${
            transcripts ? "transcript stored" : "no transcript"
          }`,
        }
      },
    })
  }

  const hot = await gatherTasks(store, [...messengers, ...mailboxes], {
    now,
    newSince: newSince ?? previousDigestAt(env, now),
  })
  const tasks: Pending[] = hot.tasks.map(({ task, groups, askedBy, for: doer }) => ({
    item: {
      ref: task.ref,
      who: askedBy,
      at: task.dueAt ?? task.createdAt,
      excerpt: oneLine(task.title, excerpt),
      why: groups.join(", "),
      due: task.dueAt,
      for: doer,
    },
  }))

  const projects: Pending[] = []
  const projectNext: string[] = []
  for (const project of await store.knowledge.projects()) {
    const status = await projectStatus(store, { project: project.ref, after: since })
    const fresh = status.items.filter(
      (item) => item.signal !== "coverage" && item.at !== null && Date.parse(item.at) >= since,
    )
    const isWatched = watched.projects.has(project.id) || watched.projects.has(project.ref)
    if (fresh.length === 0 && !isWatched) continue
    projectNext.push(`memo projects status ${project.key ?? project.ref} --since-time ${days}`)
    if (fresh.length === 0)
      projects.push({
        item: { ref: project.ref, who: null, at: iso(since), excerpt: project.name, why: "watched project, quiet" },
      })
    for (const item of fresh)
      projects.push({
        item: {
          ref: item.evidence[0]?.ref ?? item.chat ?? project.ref,
          who: item.who?.owner ? "you" : (item.who?.name ?? null),
          at: item.at as string,
          excerpt: oneLine(`${project.key ?? project.name}: ${statusLine(item.data)}`, excerpt),
          why: `${isWatched ? "watched project, " : ""}${item.signal}`,
        },
      })
  }

  const waiting = await counted(store, env, { status: "proposed" })
  const proposed = await listReview(store, env, [], { limit, page: 1 })
  const proposals: Pending[] = proposed.items.map((row) => ({
    item: {
      ref: row.id,
      who: row.proposer,
      at: row.createdAt,
      excerpt: oneLine(row.title, excerpt),
      why: row.kind,
    },
  }))

  const sections = [
    await section("watch", watch, limit, [
      "memo tags list tag:watch",
      ...[...watched.people].map((uid) => `memo context person:${uid}`),
    ]),
    {
      ...(await section("owed", owed, limit, [
        ...owedNext,
        ...(olderMail ? [`# ${olderMail} mail threads owed from before the window left out`] : []),
      ])),
      ...(unknown.count ? { unknown } : {}),
    },
    await section("mail", mail, limit, [...mailNext, ...(bulk ? [`# ${bulk} bulk or list threads left out`] : [])]),
    await section("meetings", meetings, limit, ["memo search meetings <words>"]),
    await section("tasks", tasks, limit, ["memo tasks list"]),
    await section("projects", projects, limit, projectNext),
    await section("proposals", proposals, limit, ["memo review list"], waiting.total),
  ]
  const providerCount = (provider: string) => accounts.filter((key) => key.provider === provider).length
  const meetingAccounts = accounts.filter((key) => kindOf(key.provider) === "meetings").length
  const sources: Scope["sources"] = [
    { kind: "telegram", accounts: providerCount("telegram") },
    { kind: "max", accounts: providerCount("max") },
    { kind: "whatsapp", accounts: providerCount("whatsapp") },
    { kind: "mail", accounts: mailboxes.length },
    { kind: "meeting", accounts: meetingAccounts },
    { kind: "task", accounts: hot.accounts },
  ]
  return {
    since: iso(since),
    at: iso(now),
    scope: {
      from: iso(since),
      to: iso(now),
      sources: sources.filter((one) => one.accounts > 0),
      counts: { chats: chatsMoved, mail: mailMoved, tasks: hot.tasks.length, meetings: meetings.length },
    },
    tasks: hot.counts,
    health: health.sort((a, b) => HEALTH_ORDER.indexOf(a.reason) - HEALTH_ORDER.indexOf(b.reason)),
    coverage,
    sections,
    untrusted: ["sections.items.who", "sections.items.excerpt", "sections.items.for"],
  }
}
