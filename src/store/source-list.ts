import { CliError } from "@wirecat/cli-base"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { loadConfig } from "../config.js"

/** What a `--source` list names among the texts outside a chat: mailboxes, memo's notes, imported documents. */
export interface SourceList {
  mail: AccountKey[]
  notes: boolean
  documents: boolean
}

const MAIL = new Set(["mail", "email"])
const NOTES = new Set(["notes"])
const DOCUMENTS = new Set(["documents", "drive"])
const MESSENGERS = new Set(["messages", "telegram", "tg", "max", "whatsapp", "wa"])
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

/**
 * cli-core's four `--source` shapes, read here because cli-core keeps its list reader to itself: memo also knows
 * a mailbox by its name in mail.accounts, which the store does not hold.
 */
export const sourceListOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string): Promise<SourceList> => {
  const groups = await store.accounts.accountGroups()
  const held = await store.accounts.accounts()
  const list: SourceList = { mail: [], notes: false, documents: false }
  const addMail = (key: AccountKey) => {
    if (!list.mail.some(({ account }) => account === key.account)) list.mail.push(key)
  }
  const read = async (entry: string, depth: number): Promise<void> => {
    const word = entry.trim()
    if (!word) return
    const group = word.startsWith("group:") ? word.slice("group:".length) : word === "all" ? "all" : undefined
    if (group === "all" && groups.all === undefined) {
      for (const key of held) if (key.provider === "email") addMail(key)
      list.notes = true
      list.documents = true
      return
    }
    if (group !== undefined) {
      const members = groups[group]
      if (members === undefined || depth > 3)
        throw new CliError("not_found", `no account group "${group}"; config set account_groups.${group} <entries>`)
      for (const member of members) await read(member, depth + 1)
      return
    }
    const [provider = "", ...rest] = word.split(":")
    const account = rest.join(":")
    if (MAIL.has(provider)) {
      if (account) addMail(await mailboxOf(store, env, account))
      else for (const key of held) if (key.provider === "email") addMail(key)
    } else if (NOTES.has(provider) && (!account || account === "internal")) list.notes = true
    else if (DOCUMENTS.has(provider) && !account) list.documents = true
    else if (MESSENGERS.has(provider))
      throw new CliError(
        "validation_error",
        `${word}: mentions in chats are the messenger's — tg <profile> mentions list`,
      )
    else throw new CliError("validation_error", `${word} is not a source memo reads here: ${SHAPES}`)
  }
  for (const entry of value.split(",")) await read(entry, 0)
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
