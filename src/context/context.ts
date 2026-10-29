import { CliError } from "@wirecat/cli-base"
import { calendarAccounts, type PersonContext, personContext } from "@wirecat/cli-core/services"
import type { AccountKey, Link, MessageStore, Note } from "@wirecat/cli-core/store"
import { type NotesAbout, notesAbout } from "../notes/about.js"
import { withOwner } from "../people/owner.js"
import { selectAccount } from "../store/scope.js"
import { oneAccountOf } from "../store/source-list.js"
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
  messages: Omit<PersonContext, "events">
  /** Calendar events any identity linked to them is invited to, one occurrence per series, from every calendar. */
  events: PersonContext["events"] & { accounts: string[] }
  /** Notes linked to them: file notes about them, notes linking them or a note about them. */
  notes: Omit<NotesAbout, "subject" | "name">
  /** What you wrote about them here (`memo notes add --subject`). */
  yourNotes: Pick<Note, "id" | "ref" | "text" | "revision" | "updatedAt">[]
  /** Sources that gave nothing, and why. */
  notRead: { source: string; reason: string }[]
  tasks: Awaited<ReturnType<typeof personTasks>>
  relationships: Link[]
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
const RELATIONS = new Set(["member-of", "related-to"])

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
/** The stored account of the person's messenger that `source` (`telegram:1`) names, as memoContext takes it. */
export const contextAccountOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  person: string,
  source: string,
): Promise<AccountKey> => {
  const key = await oneAccountOf(store, env, source)
  if (!person.startsWith("person:") && key.provider !== person.split(":")[0])
    throw new CliError("validation_error", `${source} is not an account of ${person}'s messenger`)
  return key
}

/**
 * `person:<uid>` as the `<messenger>:<id>` of one identity, read from the one account that saw it. A person seen by
 * several accounts is not guessed at: the owner picks with `--source`.
 */
const anchorOf = async (
  store: MessageStore,
  uid: string,
  source: AccountKey | undefined,
): Promise<{ reference: string; provider: string; account: string }> => {
  const person = await store.people.personByUid(uid)
  if (person === undefined) throw new CliError("not_found", `no person:${uid} in the store`)
  const seen = person.identities.flatMap((identity) =>
    identity.accounts.map((held) => ({
      reference: `${identity.provider}:${identity.id}`,
      provider: identity.provider,
      account: held,
    })),
  )
  const matches = seen.filter(
    (one) => source === undefined || (one.provider === source.provider && one.account === source.account),
  )
  const [only] = matches
  if (matches.length === 1 && only) return only
  const accounts = [...new Set(matches.map((one) => `${one.provider}:${one.account}`))]
  throw new CliError(
    matches.length === 0 ? "not_found" : "validation_error",
    matches.length === 0
      ? `no account in the store has seen person:${uid}`
      : `person:${uid} was seen by ${accounts.length} accounts; give one with --source: ${accounts.join(", ")}`,
  )
}

export const memoContext = async (
  store: MessageStore,
  reference: string,
  { limit = 20, source }: { limit?: number; source?: AccountKey } = {},
): Promise<MemoContext> => {
  const named = (await withOwner(store, reference)).trim()
  if (named.startsWith("person:")) {
    const anchor = await anchorOf(store, named.slice("person:".length), source)
    return memoContext(store, anchor.reference, { limit, source: anchor })
  }
  const [, provider, who] = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim()) ?? []
  if (provider === undefined || who === undefined)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`, {
      reason: "identity.no-messenger",
    })
  const accounts = await store.accounts.accounts()
  const asked = await selectAccount(store, { provider, ...(source === undefined ? {} : { account: source.account }) })

  const { events, ...messages } = await personContext(store, asked, who, { messages: limit })
  const calendars = await calendarAccounts(store)
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

  if (calendars.length === 0)
    notRead.push({ source: "events", reason: "no calendar in the store — gcal <profile> sync" })

  const tasks = await personTasks(store, messages.person, accounts, limit)
  const incoming = await store.notes.links({ to: person })
  const relationships = [...(await store.notes.links({ from: person })), ...incoming].filter(
    (link) => RELATIONS.has(link.kind) && link.confirmed,
  )
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
    files,
    untrusted: UNTRUSTED_EVENT_FIELDS,
  }
}
