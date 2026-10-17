import { CliError } from "@wirecat/cli-base"
import { entriesOfList } from "@wirecat/cli-core/services"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
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
const listedOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string) => {
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
  return entriesOfList((await each(value.split(","))).join(","), {
    held: await store.accounts.storedAccounts(),
    groups,
    profiles: await store.accounts.profiles(),
    running: { provider: "email", command: "memo" },
  })
}

export const sourceListOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string): Promise<SourceList> => {
  const listed = await listedOf(store, env, value)
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

/**
 * The configured mailboxes `sync` reads: the store holds no account before its first sync, so names are looked up in
 * mail.accounts, and a group's other members are left out. `undefined` is every one.
 */
export const syncedMailboxesOf = async (store: MessageStore, value: string): Promise<string[] | undefined> => {
  const groups = await store.accounts.accountGroups()
  const names: string[] = []
  const add = (entry: string, group?: string) => {
    const [provider = "", ...rest] = entry.trim().split(":")
    if (provider === "group") {
      const members = groups[rest.join(":")]
      if (members === undefined) throw new CliError("not_found", `no account group "${rest.join(":")}"`)
      for (const member of members) add(member, rest.join(":"))
    } else if (!MAIL.has(provider)) {
      if (group === undefined)
        throw new CliError("validation_error", `${entry}: sync reads mail only — ${MAIL_SOURCES}`)
    } else if (rest.length === 0) names.push("*")
    else names.push(rest.join(":"))
  }
  for (const entry of value.split(",").filter((one) => one.trim())) add(entry)
  return names.includes("*") ? undefined : [...new Set(names)]
}

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

export const ACCOUNTS_HELP = `which accounts, separated by commas: ${SHAPES}`

export const MEETING_ACCOUNT_HELP =
  "the meeting account: provider:account (zoom:me@example.com), or a provider that has one"

export const ONE_ACCOUNT_HELP =
  "the one account: provider:account (telegram:500, email:personal), or a provider or group:<name> that holds only one"

/** Every stored account a `--source` value names, of any kind, each once. */
export const accountsOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string): Promise<AccountKey[]> => {
  const keys: AccountKey[] = []
  for (const { accounts } of await listedOf(store, env, value))
    for (const { provider, account } of accounts)
      if (!keys.some((one) => one.provider === provider && one.account === account)) keys.push({ provider, account })
  return keys
}

const named = (keys: readonly AccountKey[]) => keys.map((key) => accountName(key)).join(", ")

const unnamed = async (store: MessageStore) =>
  new CliError(
    "validation_error",
    `give --source <provider>:<account> — the store holds ${named(await store.accounts.accounts()) || "no account yet"}`,
  )

/** A write acts as exactly one account, and the owner names it: none or several is an error listing the choices. */
export const oneAccountOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  value: string | undefined,
): Promise<AccountKey> => {
  if (value === undefined) throw await unnamed(store)
  const keys = await accountsOf(store, env, value)
  if (keys.length === 1) return keys[0] as AccountKey
  if (keys.length === 0) throw new CliError("not_found", `${value} names no stored account`)
  throw new CliError("validation_error", `${value} names ${keys.length} accounts; give one: ${named(keys)}`)
}

export interface SourceOptions {
  source?: string
  provider?: string
  account?: string
}

/** `--source`, and for one release the `--provider --account` it replaces. */
export const sourceOptions = (command: Command, help: string): Command =>
  command
    .option("--source <accounts>", help)
    .option("--provider <provider>", "deprecated: --source <provider>")
    .option("--account <account>", "deprecated: --source <provider>:<account>")

/** The `--source` an old `--provider --account` stands for; the new spelling goes to stderr. */
export const sourceOf = (options: SourceOptions, warn: (text: string) => void): string | undefined => {
  if (options.provider === undefined && options.account === undefined) return options.source
  if (options.source !== undefined)
    throw new CliError(
      "validation_error",
      "--provider and --account are the old --source <provider>:<account>; give one of them",
    )
  if (options.provider === undefined)
    throw new CliError("validation_error", "--account needs its provider: --source <provider>:<account>")
  const value = options.account === undefined ? options.provider : `${options.provider}:${options.account}`
  warn(`--provider and --account are deprecated: use --source ${value}\n`)
  return value
}

/** The one account `--source` or the old `--provider --account` names. */
export const theAccount = (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: SourceOptions,
  warn: (text: string) => void,
): Promise<AccountKey> => oneAccountOf(store, env, sourceOf(options, warn))

/** Every account `--source` or the old `--provider --account` names; none named is an error, never all of them. */
export const theAccounts = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: SourceOptions,
  warn: (text: string) => void,
): Promise<AccountKey[]> => {
  const value = sourceOf(options, warn)
  if (value === undefined) throw await unnamed(store)
  const keys = await accountsOf(store, env, value)
  if (keys.length === 0) throw new CliError("not_found", `${value} names no stored account`)
  return keys
}

export const accountName = ({ provider, account }: AccountKey) => `${provider}:${account}`
