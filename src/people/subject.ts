import { formatReference } from "@wirecat/cli-core"
import type { MessageStore, PersonRecord } from "@wirecat/cli-core/store"
import { identityOf } from "./identity.js"

const TYPED = /^(person|organization|project|note|document|task|msg|chat|contact|folder|meeting):\S+$/

export interface Subject {
  ref: string
  person?: PersonRecord
}

/** A typed reference as written, or `<messenger>:<name or id>` turned into the person behind it. */
export const subjectOf = async (store: MessageStore, text: string): Promise<Subject> => {
  const typed = text.trim()
  if (typed.startsWith("person:")) {
    const person = await store.personByUid(typed.slice("person:".length))
    return person === undefined ? { ref: typed } : { ref: typed, person }
  }
  if (TYPED.test(typed)) return { ref: typed }
  const identity = await identityOf(store, text)
  const person = await store.personOf(identity)
  return person === undefined
    ? { ref: formatReference({ type: "contact", provider: identity.provider, id: identity.id }) }
    : { ref: `person:${person.uid}`, person }
}
