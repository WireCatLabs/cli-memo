import { CliError } from "@wirecat/cli-core"
import { type PersonContext, personContext } from "@wirecat/cli-messaging/services"
import type { Link, MessageStore, Note } from "@wirecat/cli-messaging/store"
import { type NotesAbout, notesAbout } from "../notes/about.js"
import { selectAccount } from "../store/scope.js"
import { personTasks } from "../tasks/context.js"

export interface MemoContext {
  /** Messages and mail, from the store: every identity linked to the person, by id. */
  messages: PersonContext
  /** Notes linked to them: file notes about them, notes linking them or a note about them. */
  notes: Omit<NotesAbout, "subject" | "name">
  /** What you wrote about them here (`memo notes add --about`). */
  yourNotes: Pick<Note, "id" | "text" | "revision" | "updatedAt">[]
  /** Sources that gave nothing, and why. */
  notRead: { source: string; reason: string }[]
  tasks: Awaited<ReturnType<typeof personTasks>>
  relationships: Link[]
}

/** An assignment shows under tasks, not here. */
const RELATIONS = new Set(["member-of", "related-to"])

/**
 * One answer about a person: what the store holds of them across messengers and mail (cli-messaging's
 * person context), and every note linked to them. A name in a note's plain text is not a link.
 */
export const memoContext = async (
  store: MessageStore,
  reference: string,
  { limit = 20, account }: { limit?: number; account?: string } = {},
): Promise<MemoContext> => {
  const [, provider, who] = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim()) ?? []
  if (provider === undefined || who === undefined)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`)
  const accounts = await store.accounts()
  const asked = await selectAccount(store, { provider, ...(account === undefined ? {} : { account }) })

  const messages = await personContext(store, asked, who, { messages: limit })
  const person = `person:${messages.person.uid}`
  const linked = await notesAbout(store, { ref: person, person: messages.person }, limit)
  const yourNotes = []
  for (const ref of linked.about.filter((note) => note.source === "internal")) {
    const note = await store.notes.note(ref.ref.slice("note:".length))
    yourNotes.push({ id: note.id, text: note.text, revision: note.revision, updatedAt: note.updatedAt })
  }
  const notRead: MemoContext["notRead"] = []
  if ((await store.notes.folders()).length === 0)
    notRead.push({ source: "notes", reason: "no folder of notes — memo folders add <path>, then memo notes import" })
  if (!messages.person.identities.some((identity) => identity.provider === "email"))
    notRead.push({
      source: "mail",
      reason: "no mail address linked to them — tg contacts link <person> email:<address>",
    })

  const tasks = await personTasks(store, messages.person, accounts, limit)
  const relationships = [
    ...(await store.notes.links({ from: person })),
    ...(await store.notes.links({ to: person })),
  ].filter((link) => RELATIONS.has(link.kind) && link.confirmed)
  const { subject: _, name: __, ...notes } = linked
  return {
    messages,
    notes: { ...notes, about: notes.about.filter((note) => note.source === "file") },
    yourNotes,
    notRead,
    tasks,
    relationships,
  }
}
