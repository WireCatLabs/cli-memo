import { CliError } from "@leemour/cli-core"
import { pickPerson } from "@leemour/cli-messaging"
import type { IdentityRef, MessageStore } from "@leemour/cli-messaging/store"

/** `telegram:Ana`, `max:12345`, `email:ana@example.com` — the messenger is always named. */
export const identityOf = async (store: MessageStore, reference: string): Promise<IdentityRef> => {
  const match = /^([a-z][a-z0-9-]*):(.+)$/.exec(reference.trim())
  if (match === null)
    throw new CliError("validation_error", `"${reference}" names no messenger — write it as <messenger>:<name or id>`)
  const [, provider = "", who = ""] = match
  const people = await store.people(provider)
  const exact = people.get(provider === "email" ? who.toLowerCase() : who)
  return { provider, id: exact?.id ?? pickPerson(who, people).id }
}
