import { CliError } from "@wirecat/cli-base"
import { entriesOfList } from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { loadConfig } from "../config.js"

/** What a `--source` list names among the texts outside a chat: mailboxes, memo's notes, imported documents. */
export interface SourceList {
  mail: AccountKey[]
  notes: boolean
  documents: boolean
}

const MAIL = new Set(["mail", "email"])
const MESSENGERS = new Set(["messages", "telegram", "tg", "max", "whatsapp", "wa", "personal", "bots"])
const SHAPES = "provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>"

const mailboxOf = async (store: MessageStore, env: NodeJS.ProcessEnv, name: string): Promise<AccountKey> => {
  const configured = loadConfig(env).mail?.accounts ?? []
  const named = configured.find(
    (account) => account.name === name || account.address.toLowerCase() === name.toLowerCase(),
  )
  if (named) return { provider: "email", account: named.address.toLowerCase() }
  const stored = (await store.accounts.accounts()).find(
    (key) => key.provider === "email" && key.account === name.toLowerCase(),
  )
  if (stored) return stored
  const choices = configured.map((one) => one.name).join(", ") || "none in mail.accounts"
  throw new CliError("not_found", `no mail account "${name}" — mail.accounts holds ${choices}`, {
    reason: "mail.account-unknown",
    account: name,
  })
}

const messengers = (entry: string) =>
  new CliError("validation_error", `${entry}: mentions in chats are the messenger's — tg <profile> mentions list`)

/**
 * cli-core's four `--source` shapes through its own reader. memo also knows a mailbox by its name in mail.accounts,
 * which the store does not hold, so `email:<name>` becomes `email:<address>` first; notes and documents are memo's
 * own texts and count even before the store holds an account of them.
 */
export const sourceListOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string): Promise<SourceList> => {
  const named = async (entry: string) => {
    const [provider = "", ...rest] = entry.trim().split(":")
    const account = rest.join(":")
    if (!MAIL.has(provider) || !account) return entry.trim()
    return `email:${(await mailboxOf(store, env, account)).account}`
  }
  const each = (entries: readonly string[]) => Promise.all(entries.filter((one) => one.trim()).map(named))
  const groups = Object.fromEntries(
    await Promise.all(
      Object.entries(await store.accounts.accountGroups()).map(async ([name, members]) => [name, await each(members)]),
    ),
  )
  const listed = entriesOfList((await each(value.split(","))).join(","), {
    held: await store.accounts.storedAccounts(),
    groups,
    profiles: await store.accounts.profiles(),
    running: { provider: "email", command: "memo" },
  })
  const list: SourceList = { mail: [], notes: false, documents: false }
  for (const { entry, accounts } of listed) {
    const word = entry.split(":")[0] ?? ""
    if (MESSENGERS.has(word)) throw messengers(entry)
    if (word === "notes" || word === "all") list.notes = true
    if (word === "documents" || word === "drive" || word === "all") list.documents = true
    for (const { provider, account, kind } of accounts) {
      if (kind === "mail") {
        if (!list.mail.some((one) => one.account === account)) list.mail.push({ provider, account })
      } else if (kind === "notes") list.notes = true
      else if (kind === "documents") list.documents = true
      else if (word !== "all") throw messengers(entry)
    }
  }
  return list
}

export const SOURCE_HELP = `which texts, separated by commas: ${SHAPES}`

export const MAIL_SOURCES = "email:<account> (its name in mail.accounts or its address), email or group:<name>"

/** The mailboxes a mail-only command reads; a list that names notes or documents is refused, not cut. */
export const mailboxesOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  value: string,
): Promise<AccountKey[]> => {
  const list = await sourceListOf(store, env, value)
  if (list.notes || list.documents)
    throw new CliError("validation_error", `${value}: this reads mail only — ${MAIL_SOURCES}`)
  return list.mail
}
