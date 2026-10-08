import { CliError } from "@leemour/cli-core"
import type { AccountKey, MessageStore } from "@leemour/cli-messaging/store"

/**
 * The owner's own records (notes, people, organisations) belong to no account, but the store's knowledge
 * interface still asks for one, so any stored account stands in for "the owner".
 */
export const ownerKey = async (store: MessageStore): Promise<AccountKey | undefined> => {
  const accounts = await store.accounts()
  return accounts.find(({ provider }) => provider !== "notes") ?? accounts[0]
}

export const requiredOwnerKey = async (store: MessageStore): Promise<AccountKey> => {
  const key = await ownerKey(store)
  if (key === undefined)
    throw new CliError(
      "configuration_error",
      "the store holds no account yet — run tg, max or memo mail import once before labelling or relating",
    )
  return key
}
