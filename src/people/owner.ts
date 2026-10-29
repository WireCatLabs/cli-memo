import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"

/**
 * `person:me` as the owner's `person:<uid>`; any other reference as written. The store always holds an owner row; it is
 * marked once an identity is linked to it.
 */
export const withOwner = async (store: MessageStore, reference: string): Promise<string> => {
  if (reference.trim() !== "person:me") return reference
  const owner = await store.people.owner()
  if (owner === undefined || owner.identities.length === 0)
    throw new CliError(
      "not_found",
      "person:me: no person is marked as you in the store; mark yours with `tg <profile> contacts link <your id> me`",
      { reason: "person.no-owner" },
    )
  return `person:${owner.uid}`
}
