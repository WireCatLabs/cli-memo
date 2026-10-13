import { formatReference } from "@wirecat/cli-messaging"
import type { Link, MessageStore, Note } from "@wirecat/cli-messaging/store"
import type { Subject } from "../people/subject.js"

/** A file in a notes folder is a `document:`, a written note a `note:`. */
export const isNoteReference = (reference: string): boolean => /^(note|document):/.test(reference)

export interface NoteRef {
  ref: string
  source: Note["source"]
  folderId: string | null
  path: string | null
  title: string | null
  modifiedAt: string
  /** The heading or block the link points at. */
  anchor?: string
}

export interface NotesAbout {
  subject: string
  name: string | null
  /** Notes that say they are about the subject. */
  about: NoteRef[]
  /** Notes that link the subject directly. */
  linking: NoteRef[]
  /** Notes that link one of the notes about the subject. */
  throughNotes: NoteRef[]
  /** Links written with one of the person's names that the store could not resolve: two people share it. */
  waiting: (NoteRef & { text: string })[]
  hasMore: boolean
}

const fold = (value: string) => value.normalize("NFC").toLocaleLowerCase("en").trim().replace(/^@/, "")

const refOf = (note: Note, anchor: string | null = null): NoteRef => ({
  ref: note.ref,
  source: note.source,
  folderId: note.folderId,
  path: note.path,
  title: note.title,
  modifiedAt: note.updatedAt,
  ...(anchor === null ? {} : { anchor }),
})

/** How a note reaches its subject: says it is about it, links it, links a note about it, or names it in a link. */
export type Via = "about" | "link" | "through" | "name"

export type Found = { note: Note; anchor: string | null; text: string | null; via: Via }

const PAGE = 500

/** Every live note that reaches a subject through the links the store holds — never a name found in plain text. */
export const notesReaching = async (store: MessageStore, subject: Subject): Promise<Found[]> => {
  const refs = [
    subject.ref,
    ...(subject.person?.identities.map((identity) =>
      formatReference({ type: "contact", provider: identity.provider, id: identity.id }),
    ) ?? []),
  ]
  const live = async (links: Link[], via: Via) => {
    const found: Found[] = []
    for (const link of links) {
      if (!isNoteReference(link.from)) continue
      const note = await store.notes.resolveNote(link.from)
      if (note && note.deletedAt === null) found.push({ note, anchor: link.anchor, text: link.targetText, via })
    }
    return found
  }
  const aboutOne = async (ref: string) => {
    const notes: Note[] = []
    for (let offset = 0; ; offset += PAGE) {
      const page = await store.notes.notes({ about: ref, limit: PAGE, offset })
      notes.push(...page.items)
      if (!page.hasMore) return notes
    }
  }
  // A written note's first subject is the note's own, not a link, so only `notes({ about })` sees all of them.
  const about: Found[] = (await Promise.all(refs.map(aboutOne)))
    .flat()
    .map((note) => ({ note, anchor: null, text: null, via: "about" }))
  const linking = await live(
    (await Promise.all(refs.map((to) => store.notes.links({ to })))).flat().filter((link) => link.kind === "links-to"),
    "link",
  )
  const through = await live(
    (await Promise.all(about.map(({ note }) => store.notes.links({ to: note.ref }))))
      .flat()
      .filter((link) => link.kind === "links-to"),
    "through",
  )
  const names = new Set(
    [subject.person?.name, ...(subject.person?.identities.map(({ name }) => name) ?? [])]
      .filter((name): name is string => !!name?.trim())
      .map(fold),
  )
  const waiting =
    names.size === 0
      ? []
      : await live(
          (await store.notes.links({ unresolved: true })).filter((link) => names.has(fold(link.targetText ?? ""))),
          "name",
        )
  return [...about, ...linking, ...through, ...waiting]
}

/** What notes say about a subject, split by how each reaches it. */
export const notesAbout = async (store: MessageStore, subject: Subject, limit = 20): Promise<NotesAbout> => {
  const found = await notesReaching(store, subject)
  const unique = (via: Via) =>
    [
      ...new Map(
        found.filter((item) => item.via === via).map((item) => [`${item.note.ref}#${item.anchor ?? ""}`, item]),
      ).values(),
    ].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
  const [about, linking, through, waiting] = (["about", "link", "through", "name"] as const).map(unique)
  return {
    subject: subject.ref,
    name: subject.person?.name ?? null,
    about: (about ?? []).slice(0, limit).map(({ note }) => refOf(note)),
    linking: (linking ?? []).slice(0, limit).map(({ note, anchor }) => refOf(note, anchor)),
    throughNotes: (through ?? []).slice(0, limit).map(({ note, anchor }) => refOf(note, anchor)),
    waiting: (waiting ?? []).slice(0, limit).map(({ note, text }) => ({ ...refOf(note), text: text ?? "" })),
    hasMore: [about, linking, through, waiting].some((list) => (list ?? []).length > limit),
  }
}
