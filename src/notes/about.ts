import { formatReference } from "@wirecat/cli-messaging"
import type { Link, MessageStore, Note } from "@wirecat/cli-messaging/store"
import type { Subject } from "../people/subject.js"

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
  ref: `note:${note.id}`,
  source: note.source,
  folderId: note.folderId,
  path: note.path,
  title: note.title,
  modifiedAt: note.updatedAt,
  ...(anchor === null ? {} : { anchor }),
})

/** What notes say about a subject, through the links the store holds — never a name found in plain text. */
export const notesAbout = async (store: MessageStore, subject: Subject, limit = 20): Promise<NotesAbout> => {
  const refs = [
    subject.ref,
    ...(subject.person?.identities.map((identity) =>
      formatReference({ type: "contact", provider: identity.provider, id: identity.id }),
    ) ?? []),
  ]
  const live = async (links: Link[]) => {
    const found: { note: Note; link: Link }[] = []
    for (const link of links) {
      if (!link.from.startsWith("note:")) continue
      const note = await store.notes.note(link.from.slice("note:".length)).catch(() => undefined)
      if (note && note.deletedAt === null) found.push({ note, link })
    }
    return found
  }
  const pointing = await live((await Promise.all(refs.map((to) => store.notes.links({ to })))).flat())
  const about = pointing.filter(({ link }) => link.kind === "about")
  const linking = pointing.filter(({ link }) => link.kind === "links-to")
  const through = await live(
    (await Promise.all(about.map(({ note }) => store.notes.links({ to: `note:${note.id}` }))))
      .flat()
      .filter((link) => link.kind === "links-to"),
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
        )
  const unique = <T extends { note: Note; link: Link }>(items: T[]) =>
    [...new Map(items.map((item) => [`${item.note.id}#${item.link.anchor ?? ""}`, item])).values()].sort((a, b) =>
      b.note.updatedAt.localeCompare(a.note.updatedAt),
    )
  const lists = [about, linking, through, waiting].map(unique)
  return {
    subject: subject.ref,
    name: subject.person?.name ?? null,
    about: (lists[0] ?? []).slice(0, limit).map(({ note }) => refOf(note)),
    linking: (lists[1] ?? []).slice(0, limit).map(({ note, link }) => refOf(note, link.anchor)),
    throughNotes: (lists[2] ?? []).slice(0, limit).map(({ note, link }) => refOf(note, link.anchor)),
    waiting: (lists[3] ?? [])
      .slice(0, limit)
      .map(({ note, link }) => ({ ...refOf(note), text: link.targetText ?? "" })),
    hasMore: lists.some((list) => list.length > limit),
  }
}

export const aboutText = (answer: NotesAbout): string => {
  const line = (note: NoteRef) => `  ${note.path ?? note.ref}${note.anchor ? ` ${note.anchor}` : ""}`
  const section = (title: string, notes: NoteRef[]) => (notes.length ? [title, ...notes.map(line), ""] : [])
  const who = answer.name ?? answer.subject
  return [
    ...(answer.about.length ? section("About", answer.about) : [`No note about ${who}.`, ""]),
    ...section("Linking them", answer.linking),
    ...section("Linking a note about them", answer.throughNotes),
    ...section("Written with their name, but two people share it — link one with tg contacts link", answer.waiting),
    ...(answer.hasMore ? ["More were found; raise --limit to see them."] : []),
  ]
    .join("\n")
    .trimEnd()
}
