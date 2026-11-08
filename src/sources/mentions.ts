import type { MessageStore, Note } from "@wirecat/cli-core/store"

export interface NamedInSource {
  ref: string
  type: "person" | "organization"
  name: string | null
  /** The words of the text it was found by: a name as written, an e-mail address or a phone number. */
  foundAs: string[]
}

export interface SourceMentions {
  items: NamedInSource[]
  /** Organizations memo read the names of; a store with more than the store lists at once is not covered whole. */
  organizationsChecked: number
  organizationsComplete: boolean
}

const PAGE = 500
const ORGANIZATIONS_LISTED = 500

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const folded = (text: string) => text.normalize("NFC").toLocaleLowerCase()

/**
 * The document's own mentions, read from cli-core's list of every document's mentions. The list is ordered by each
 * document's time, newest first, then its id, so one document's mentions come together and the walk stops once it is
 * past them, or past where they would be.
 */
const mentionsOf = async (store: MessageStore, note: Note) => {
  const id = Number(note.id)
  const at = note.modifiedAt ?? note.updatedAt
  const found = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.sourceMentions.list("document", undefined, { limit: PAGE, offset }, [])
    for (const mention of page.items) {
      const when = mention.source.at ?? ""
      if (mention.source.id === id) found.push(mention)
      else if (found.length > 0 || when < at || (when === at && mention.source.id < id)) return found
    }
    if (!page.hasMore) return found
  }
}

/**
 * People and organizations memo knows whose names appear in a document. People come from cli-core's mentions: a
 * name it found, linked or matching known people, and an e-mail address or phone number a person owns. Organizations
 * are matched by their whole name in the text, since no mention kind finds them.
 */
export const namedIn = async (store: MessageStore, note: Note): Promise<SourceMentions> => {
  const named = new Map<string, NamedInSource>()
  const add = (ref: string, type: NamedInSource["type"], name: string | null, foundAs: string) => {
    const entry = named.get(ref) ?? { ref, type, name, foundAs: [] }
    if (!entry.foundAs.includes(foundAs)) entry.foundAs.push(foundAs)
    named.set(ref, entry)
  }
  const candidates = new Map<string, string[]>()
  for (const mention of await mentionsOf(store, note)) {
    if (mention.status === "dismissed") continue
    if (mention.kind === "person-name") {
      let people = mention.target?.startsWith("person:") ? [mention.target] : candidates.get(mention.value)
      if (people === undefined) {
        people = (await store.sourceMentions.show(mention.id, []))?.candidates ?? []
        candidates.set(mention.value, people)
      }
      for (const ref of people) add(ref, "person", null, mention.written)
    } else if (mention.kind === "email" || mention.kind === "phone") {
      const person = await store.people.personOf({ provider: mention.kind, id: mention.value })
      if (person) add(`person:${person.uid}`, "person", person.name, mention.written)
    }
  }
  for (const entry of named.values())
    if (entry.name === null)
      entry.name = (await store.people.personByUid(entry.ref.slice("person:".length)))?.name ?? null

  const text = folded(`${note.title ?? ""}\n${note.text}`)
  const organizations = await store.knowledge.organizations()
  for (const organization of organizations) {
    const name = organization.name.trim()
    if (name.length < 3) continue
    const at = new RegExp(`(?<![\\p{L}\\p{N}])${escaped(folded(name))}(?![\\p{L}\\p{N}])`, "u")
    if (at.test(text)) add(organization.ref, "organization", organization.name, name)
  }
  return {
    items: [...named.values()],
    organizationsChecked: organizations.length,
    organizationsComplete: organizations.length < ORGANIZATIONS_LISTED,
  }
}
