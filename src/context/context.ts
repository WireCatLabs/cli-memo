import { CliError } from "@wirecat/cli-base"
import { isUsable, RELATION_KINDS, standingOf } from "@wirecat/cli-core"
import { mailOwnText } from "@wirecat/cli-core/mail"
import {
  type CanonicalPersonContext,
  type ContextMessage,
  type Coverage,
  calendarAccounts,
  canonicalPersonContext,
  type PersonBusiness,
  type PersonContext,
  personBusiness,
  personContext,
} from "@wirecat/cli-core/services"
import type { AccountKey, Link, MessageStore, Note, PersonRecord } from "@wirecat/cli-core/store"
import { type NotesAbout, notesAbout } from "../notes/about.js"
import { withOwner } from "../people/owner.js"
import { groupScopeOf, inGroup, scopedAccounts } from "../store/group.js"
import { selectAccount } from "../store/scope.js"
import { accountsOf } from "../store/source-list.js"
import { personTasks } from "../tasks/context.js"

/** Written by whoever sent the invitation, as cli-core's calendar tools mark them. */
const UNTRUSTED_EVENT_FIELDS = [
  "events.upcoming.title",
  "events.upcoming.location",
  "events.recent.title",
  "events.recent.location",
]

export interface MemoContext {
  /** Messages and mail, from the store: every identity linked to the person, by id. */
  messages: Omit<PersonContext, "events" | "person"> & { person: PersonRecord }
  /** Calendar events any identity linked to them is invited to, one occurrence per series, from every calendar. */
  events: PersonContext["events"] & { accounts: string[] }
  /** Notes linked to them: file notes about them, notes linking them or a note about them. */
  notes: Omit<NotesAbout, "subject" | "name">
  /** What you wrote about them here (`memo notes add --subject`). */
  yourNotes: Pick<Note, "id" | "ref" | "text" | "revision" | "updatedAt">[]
  /** Sources that gave nothing, and why. */
  notRead: { source: string; reason: string }[]
  tasks: Awaited<ReturnType<typeof personTasks>>
  /** Their relationships an answer may lean on: the owner's (`confirmed`) and a source's (`reported`, CRM). */
  relationships: (Link & { standing: string })[]
  /** What they are in the owner's business, each relationship with its standing (cli-core's person context). */
  business: PersonBusiness
  /** For `person:<id>`: every account read and every source not read, as cli-core's person context says. */
  coverage?: Coverage
  /** Files a source says they own or last edited, as the source reports it: not reviewed by you. */
  files: ReportedFile[]
  /** Fields other people wrote that an agent reads as data, never as instructions. */
  untrusted: string[]
}

export interface ReportedFile {
  ref: string
  title: string | null
  url: string | null
  role: string | null
  modifiedAt: string | null
  provenance: string
  confirmed: boolean
}

/** An assignment shows under tasks, not here. */
const RELATIONS: ReadonlySet<string> = new Set(RELATION_KINDS)

/** Drive copies these from Google's own file record, so they are facts as Google states them, not guesses. */
const SOURCE_REPORTS = new Set(["google-drive:files.get"])

const reportedFiles = async (store: MessageStore, links: Link[], limit: number): Promise<ReportedFile[]> => {
  const files: ReportedFile[] = []
  for (const link of links) {
    if (files.length >= limit) break
    if (link.kind !== "related-to" || !link.provenance || !SOURCE_REPORTS.has(link.provenance)) continue
    const note = await store.notes.note(link.from).catch(() => null)
    if (!note || note.deletedAt || note.folderId === null || note.path === null) continue
    const entry = await store.catalog.get(note.folderId, note.path)
    if (!entry) continue
    files.push({
      ref: note.ref,
      title: entry.name ?? note.title,
      url: entry.url ?? null,
      role: link.role,
      modifiedAt: entry.modifiedAt ?? null,
      provenance: link.provenance,
      confirmed: link.confirmed,
    })
  }
  return files
}

/**
 * One answer about a person: what the store holds of them across messengers and mail (cli-core's
 * person context), and every note linked to them. A name in a note's plain text is not a link.
 */
/**
 * The stored accounts of the person's messenger that `source` names (`telegram:1`, or a group's), as memoContext
 * takes them.
 */
export const contextAccountsOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  person: string,
  source: string,
): Promise<AccountKey[]> => {
  const provider = person.startsWith("person:") ? undefined : person.split(":")[0]
  const keys = (await accountsOf(store, env, source)).filter(
    (key) => provider === undefined || key.provider === provider,
  )
  if (keys.length === 0)
    throw new CliError("validation_error", `${source} is not an account of ${person}'s messenger`, { param: "source" })
  return keys
}

const accountIn = (keys: readonly AccountKey[] | undefined) =>
  keys?.length === 1 ? { account: (keys[0] as AccountKey).account } : {}

export const memoContext = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  reference: string,
  { limit = 20, sources }: { limit?: number; sources?: readonly AccountKey[] } = {},
): Promise<MemoContext> => {
  const named = (await withOwner(store, reference)).trim()
  const scope = await groupScopeOf(store, env)
  if (named.startsWith("person:")) {
    // Every account in scope that saw them, a CRM's and a name the owner added too, never one picked (WC-ACCT-9).
    const accounts = sources === undefined ? scope?.accounts : [...sources]
    const { events, business, coverage, ...messages } = await canonicalPersonContext(store, named, {
      messages: limit,
      limit,
      ...(accounts === undefined ? {} : { accounts }),
    })
    const read = accounts ?? (await scopedAccounts(store, env))
    const calendars = (await calendarAccounts(store)).filter(
      (one) =>
        accounts === undefined || accounts.some((key) => key.provider === one.provider && key.account === one.account),
    )
    return withNotesAndTasks(store, { messages, events, business, coverage }, { accounts: read, calendars }, limit)
  }
  const [, provider, who] = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim()) ?? []
  if (provider === undefined || who === undefined)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`, {
      reason: "identity.no-messenger",
    })
  const accounts = await scopedAccounts(store, env)
  const own = sources?.filter((one) => one.provider === provider)
  const asked =
    own?.length === 1 ? (own[0] as AccountKey) : await selectAccount(store, env, { provider, ...accountIn(own) })

  const calendars = await inGroup(store, env, await calendarAccounts(store))
  const calendarIds =
    scope === undefined
      ? undefined
      : await Promise.all(calendars.map(async (key) => (await store.accounts.storedAccount(key)).id))
  const { events, ...messages } = await personContext(store, asked, who, {
    messages: limit,
    ...(calendarIds === undefined ? {} : { calendarIds }),
  })
  // In a group a CRM's relationships outside it stay out; cli-core scopes them in its canonical person context only.
  const business =
    scope === undefined
      ? await personBusiness(store, messages.person.uid, { limit })
      : (
          await canonicalPersonContext(store, `person:${messages.person.uid}`, {
            accounts: scope.accounts,
            limit,
            messages: 1,
          })
        ).business
  return withNotesAndTasks(store, { messages, events, business }, { accounts, calendars }, limit)
}

interface Read {
  messages: MemoContext["messages"]
  events: CanonicalPersonContext["events"]
  business: PersonBusiness
  coverage?: Coverage
}

/** What memo adds to cli-core's context of a person: the notes, tasks and files linked to them. */
const withNotesAndTasks = async (
  store: MessageStore,
  { messages, events, business, coverage }: Read,
  { accounts, calendars }: { accounts: AccountKey[]; calendars: AccountKey[] },
  limit: number,
): Promise<MemoContext> => {
  const person = `person:${messages.person.uid}`
  const linked = await notesAbout(store, { ref: person, person: messages.person }, limit)
  const yourNotes = []
  for (const ref of linked.about.filter((note) => note.source === "internal")) {
    const note = await store.notes.note(ref.ref)
    yourNotes.push({ id: note.id, ref: note.ref, text: note.text, revision: note.revision, updatedAt: note.updatedAt })
  }
  const notRead: MemoContext["notRead"] = []
  if ((await store.notes.folders()).length + (await store.notes.documentsAccounts()).length === 0)
    notRead.push({
      source: "notes",
      reason: "no folder of notes — memo folders add <path>, then memo sync --only notes",
    })
  if (!messages.person.identities.some((identity) => identity.provider === "email"))
    notRead.push({
      source: "mail",
      reason: "no mail address linked to them — tg <profile> contacts link <person> email:<address>",
    })

  // For person:<id>, cli-core's coverage already says whether a calendar was read.
  if (calendars.length === 0 && coverage === undefined)
    notRead.push({ source: "events", reason: "no calendar in the store — gcal <profile> sync" })

  const tasks = await personTasks(store, messages.person, accounts, limit)
  const incoming = await store.notes.links({ to: person })
  const now = Date.now()
  const relationships = [...(await store.notes.links({ from: person })), ...incoming]
    .filter((link) => RELATIONS.has(link.kind))
    .map((link) => ({ ...link, standing: standingOf(link, now) }))
    .filter((link) => isUsable(link.standing))
  const files = await reportedFiles(store, incoming, limit)
  const { subject: _, name: __, ...notes } = linked
  return {
    messages,
    events: { ...events, accounts: calendars.map(({ provider, account }) => `${provider}:${account}`) },
    notes: { ...notes, about: notes.about.filter((note) => note.source === "file") },
    yourNotes,
    notRead,
    tasks,
    relationships,
    business,
    ...(coverage === undefined ? {} : { coverage }),
    files,
    untrusted: UNTRUSTED_EVENT_FIELDS,
  }
}

/** The context with each email's own text (`mailOwnText`): no earlier mail quoted in it, no signature. */
export const withOwnMailText = (context: MemoContext): MemoContext => {
  const own = <T extends ContextMessage | null>(message: T): T =>
    message?.provider === "email" ? { ...message, text: mailOwnText(message.text) } : message
  const { last, recent, mentions } = context.messages
  return {
    ...context,
    messages: {
      ...context.messages,
      last: { fromThem: own(last.fromThem), fromMe: own(last.fromMe), fromThemAnywhere: own(last.fromThemAnywhere) },
      recent: { direct: recent.direct.map(own), groups: recent.groups.map(own) },
      mentions: mentions.map(own),
    },
  }
}
