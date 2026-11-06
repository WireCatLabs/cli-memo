import { formatReference } from "@wirecat/cli-core"
import { mailTurn, OWED_DAYS } from "@wirecat/cli-core/mail"
import { formatMeetingReference } from "@wirecat/cli-core/meetings"
import { projectStatus, servicesFor, storeOnlyDeps } from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { APP } from "../app.js"
import { listReview } from "../review/review.js"
import { counted } from "../review/status.js"

/** The tag that puts a chat, mail thread, person, project or meeting series on the owner's watch list. */
export const WATCH_TAG = "watch"

export interface DigestItem {
  ref: string
  who: string | null
  at: string
  /** One line of what was written, quoted as data. */
  excerpt: string | null
  why: string
}

export interface DigestSection {
  name: SectionName
  items: DigestItem[]
  /** Found in the window; `items` may hold fewer when a cap or the size budget cut them. */
  total: number
  /** Commands that read what was cut, kept only when something was; a line starting with # is a note, kept always. */
  next: string[]
}

export const SECTIONS = ["watch", "owed", "mail", "meetings", "tasks", "projects", "proposals"] as const
export type SectionName = (typeof SECTIONS)[number]

export interface Coverage {
  account: string
  /** When the store last saved anything of it; `null` when it never did. */
  storedAt: string | null
  /** Nothing stored for a day: quiet may mean unsynced. */
  stale: boolean
  /** The owner wrote last in the window and nobody answered yet. */
  waiting: number
  /** Chats the chat list says moved while their newest message is not stored. */
  unsynced: number
}

export interface Digest {
  since: string
  at: string
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
}

const DAY = 86_400_000
const MESSENGERS = new Set(["telegram", "max", "whatsapp"])

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
  { since, now = Date.now(), limit, excerpt, owedWithin }: DigestOptions,
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

  for (const key of messengers) {
    const { chats, storedAt } = await store.chats.chatActivity(key, owedSince)
    const ref = (chat: string) => formatReference({ type: "chat", provider: key.provider, account: key.account, chat })
    coverage.push({
      account: name(key),
      storedAt,
      stale: storedAt === null || Date.parse(storedAt) < now - DAY,
      waiting: chats.filter((chat) => chat.lastFromOwner === true && Date.parse(chat.lastMessageAt) >= since).length,
      unsynced: chats.filter((chat) => chat.lastMessageId === null && Date.parse(chat.lastMessageAt) >= since).length,
    })
    let owedHere = 0
    for (const chat of chats) {
      if (isWatchedChat(key, chat.chatId)) continue
      if (chat.kind !== "dialog" || chat.lastFromOwner !== false) continue
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
    coverage.push({
      account: name(key),
      storedAt: newest ? iso(newest) : null,
      stale: newest < now - DAY,
      waiting: threads.filter((thread) => mailTurn(thread.newest) === "waiting" && thread.lastEmailAt >= since).length,
      unsynced: 0,
    })
    let owedHere = 0
    let newHere = 0
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
        if (inWindow) owed.push(pending("owed reply"))
        else if (thread.lastEmailAt >= owedSince) olderMail++
        owedHere++
      } else if (inWindow && !last.outgoing) {
        mail.push(pending("new mail"))
        newHere++
      }
    }
    if (owedHere) owedNext.push(`memo mail review --source ${name(key)} --unanswered 1m bulk:false`)
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

  const tasks = new Map<string, Pending>()
  let unplanned = 0
  for (const key of [...messengers, ...mailboxes]) {
    const agenda = await servicesFor(storeOnlyDeps(store, key, { app: APP, env })).agenda.show({
      within: 1,
      dueWithin: DAY,
    })
    for (const task of agenda.tasks) {
      const reasons = task.reasons.filter((reason) => reason !== "unplanned")
      if (reasons.length === 0) {
        unplanned++
        continue
      }
      tasks.set(task.id, {
        item: {
          ref: `task:${task.key ?? task.id}`,
          who: null,
          at: task.dueAt ?? task.nextCheckAt ?? task.createdAt,
          excerpt: oneLine(task.title, excerpt),
          why: reasons.join(", "),
        },
      })
    }
  }

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
    await section("owed", owed, limit, [
      ...owedNext,
      ...(olderMail ? [`# ${olderMail} mail threads owed from before the window left out`] : []),
    ]),
    await section("mail", mail, limit, [...mailNext, ...(bulk ? [`# ${bulk} bulk or list threads left out`] : [])]),
    await section("meetings", meetings, limit, ["memo search meetings <words>"]),
    await section("tasks", [...tasks.values()], limit, [
      "memo tasks list",
      ...(unplanned ? [`# ${unplanned} open tasks without a date left out`] : []),
    ]),
    await section("projects", projects, limit, projectNext),
    await section("proposals", proposals, limit, ["memo review list"], waiting.total),
  ]
  return {
    since: iso(since),
    at: iso(now),
    coverage,
    sections,
    untrusted: ["sections.items.who", "sections.items.excerpt"],
  }
}
