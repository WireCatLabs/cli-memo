import { formatReference } from "@leemour/cli-messaging"
import type { MessageStore, PersonRecord } from "@leemour/cli-messaging/store"
import { identityOf } from "./identity.js"

const TYPED = /^(person|entity|note|task|msg|chat|contact):\S+$/

export interface Subject {
  ref: string
  person?: PersonRecord
}

/** A typed reference as written, or `<messenger>:<name or id>` turned into the person behind it. */
export const subjectOf = async (store: MessageStore, text: string): Promise<Subject> => {
  if (TYPED.test(text.trim())) return { ref: text.trim() }
  const identity = await identityOf(store, text)
  const person = await store.personOf(identity)
  return person === undefined
    ? { ref: formatReference({ type: "contact", provider: identity.provider, id: identity.id }) }
    : { ref: `person:${person.uid}`, person }
}
