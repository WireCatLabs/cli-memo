import { CliError } from "@wirecat/cli-base"
import { pickPerson } from "@wirecat/cli-core"
import type { IdentityRef, MessageStore, PersonRecord } from "@wirecat/cli-core/store"
import { withOwner } from "./owner.js"

const parsed = (reference: string): { provider: string; who: string } => {
  const match = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim())
  if (match === null)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`, {
      reason: "identity.no-messenger",
    })
  const [, provider = "", who = ""] = match
  return { provider, who }
}

/** `telegram:Ana`, `max:12345`, `email:ana@example.com` — the messenger is always named. */
export const identityOf = async (store: MessageStore, reference: string): Promise<IdentityRef> => {
  const { provider, who } = parsed(reference)
  const people = await store.people.people(provider)
  const exact = people.get(provider === "email" ? who.toLowerCase() : who)
  return { provider, id: exact?.id ?? pickPerson(who, people).id }
}

/**
 * `<messenger>:<id>` exactly as the store keeps it. The owner's separations take only this: a name that resolves to
 * the nearest person would take apart someone the owner did not name.
 */
export const exactIdentityOf = async (store: MessageStore, reference: string): Promise<IdentityRef> => {
  const { provider, who } = parsed(reference)
  const ref = { provider, id: provider === "email" ? who.toLowerCase() : who }
  if ((await store.people.personOf(ref)) === undefined)
    throw new CliError("not_found", `the store has no identity ${provider}:${who}; people show lists the exact ids`, {
      reason: "identity.not-found",
    })
  return ref
}

const PERSON = /^person:([1-9]\d*)$/

/** `person:<uid>`, `person:me`, or an identity of the person as `<messenger>:<name or id>`. */
export const personOf = async (store: MessageStore, who: string): Promise<PersonRecord> => {
  const uid = PERSON.exec((await withOwner(store, who)).trim())?.[1]
  const found =
    uid === undefined ? await store.people.personOf(await identityOf(store, who)) : await store.people.personByUid(uid)
  if (found === undefined)
    throw new CliError("not_found", `the store has no person for "${who}"`, { reason: "person.not-found" })
  return found
}
