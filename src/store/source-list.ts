import { CliError } from "@wirecat/cli-base"
import { type ContextSource, entriesOfList } from "@wirecat/cli-core/services"
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
const FOLDER = "folder"
const MESSENGERS = new Set(["messages", "telegram", "tg", "max", "whatsapp", "wa", "personal", "bots"])
const SHAPES = "provider:account (email:personal), a provider (email), a kind (mail, notes, documents) or group:<name>"

const mailboxOf = async (store: MessageStore, env: NodeJS.ProcessEnv, name: string): Promise<AccountKey> => {
  const configured = loadConfig(env).mail?.accounts ?? []
  const named = configured.find(
    (account) => account.name === name || account.address.toLowerCase() === name.toLowerCase(),
  )
  if (named) return { provider: "email", account: named.address.toLowerCase() }
  const held = (await store.accounts.accounts()).filter((key) => key.provider === "email")
  const stored = held.find((key) => key.account === name.toLowerCase())
  if (stored) return stored
  const choices =
    [...new Set([...configured.map((one) => one.name), ...held.map((one) => one.account)])].join(", ") || "none"
  throw new CliError("not_found", `no mail account "${name}" — configured or stored mail accounts: ${choices}`, {
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
  const held = await store.accounts.storedAccounts()
  const named = async (entry: string) => {
    const [provider = "", ...rest] = entry.trim().split(":")
    const account = rest.join(":")
    // The store names a notes folder folder:<id>, and memo's own errors show that; the list reader knows notes:<row>.
    if (provider === FOLDER && account) {
      const folder = held.find((one) => one.provider === FOLDER && one.account === account)
      if (folder === undefined) throw new CliError("not_found", `no notes folder ${account} in the store`)
      return `notes:${folder.id}`
    }
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
    held,
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

export const MEETING_WRITE_HELP = "the meeting account it acts as: provider:account, such as zoom:me@example.com"

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

const unnamed = async (store: MessageStore, option = "--source") =>
  new CliError(
    "validation_error",
    `give ${option} <provider>:<account> — the store holds ${named(await store.accounts.accounts()) || "no account yet"}`,
  )

/**
 * The store's own key of each account the list reader named: a notes folder is `notes:<row>` to it but `folder:<id>`
 * in the store. Notes written with `notes add` belong to no stored account, so nothing can act as them.
 */
const storedKeysOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string): Promise<AccountKey[]> => {
  const held = await store.accounts.storedAccounts()
  const keys: AccountKey[] = []
  for (const key of await accountsOf(store, env, value)) {
    const folder =
      key.provider === "notes" ? held.find((one) => one.provider === FOLDER && String(one.id) === key.account) : null
    if (folder === undefined) continue
    const stored = folder ? { provider: folder.provider, account: folder.account } : key
    if (!keys.some((one) => one.provider === stored.provider && one.account === stored.account)) keys.push(stored)
  }
  return keys
}

const noStoredAccount = (value: string) =>
  new CliError(
    "not_found",
    `${value} names no stored account; notes written with memo notes add belong to none — name a notes folder ` +
      "(notes:<id>), a mailbox or a messenger account",
  )

/** One account, and the owner names it: none or several is an error listing the choices. */
export const oneAccountOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  value: string | undefined,
  option = "--source",
): Promise<AccountKey> => {
  if (value === undefined) throw await unnamed(store, option)
  const keys = await storedKeysOf(store, env, value)
  if (option === "--account" && !value.includes(":") && keys.length === 1)
    throw new CliError(
      "validation_error",
      `give --account ${named(keys)}; a provider alone does not name an acting account`,
    )
  if (keys.length === 1) return keys[0] as AccountKey
  if (keys.length === 0) throw noStoredAccount(value)
  throw new CliError("validation_error", `${value} names ${keys.length} accounts; give one: ${named(keys)}`)
}

/**
 * The stored accounts a project gather reads, as context sources: messenger accounts, mailboxes and imported notes
 * folders and meeting accounts. Your own internal notes have no context reader yet; `all` reports them as left out,
 * an entry that names only them is refused.
 */
export const contextSourcesOf = async (store: MessageStore, env: NodeJS.ProcessEnv, value: string) => {
  const held = await store.accounts.storedAccounts()
  const sources: ContextSource[] = []
  const unread: { source: string; kind: string }[] = []
  for (const { entry, accounts } of await listedOf(store, env, value)) {
    let read = 0
    for (const { provider, account, kind } of accounts) {
      const stored =
        kind === "notes"
          ? held.find((one) => one.provider === FOLDER && String(one.id) === account)
          : kind === "messages" || kind === "mail" || kind === "meetings"
            ? held.find((one) => one.provider === provider && one.account === account)
            : undefined
      if (stored === undefined) {
        unread.push({ source: `${provider}:${account}`, kind })
        continue
      }
      read++
      const source: ContextSource = {
        kind: kind === "notes" ? "document" : kind === "mail" ? "mail" : kind === "meetings" ? "meeting" : "message",
        accountId: stored.id,
        provider: stored.provider,
        account: stored.account,
      }
      if (!sources.some((one) => one.accountId === source.accountId && one.kind === source.kind)) sources.push(source)
    }
    if (read === 0 && entry.trim() !== "all")
      throw new CliError(
        "validation_error",
        `${entry}: a gather reads messenger accounts, mailboxes, meeting transcripts and imported notes folders (notes:<id>)`,
        { param: "source" },
      )
  }
  return { sources, unread, scope: value.trim() === "all" ? ("all-connected" as const) : ("explicit" as const) }
}

export interface SourceOptions {
  source?: string
}

export const sourceOptions = (command: Command, help: string): Command => command.option("--source <accounts>", help)

export const sourceOf = (options: SourceOptions, _warn: (text: string) => void): string | undefined => options.source

/** The one account `--source` names. */
export const theAccount = (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: SourceOptions,
  warn: (text: string) => void,
): Promise<AccountKey> => oneAccountOf(store, env, sourceOf(options, warn))

/** Every account `--source` names; none named is every stored account. */
export const theAccounts = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: SourceOptions,
  warn: (text: string) => void,
): Promise<AccountKey[]> => {
  const value = sourceOf(options, warn)
  if (value === undefined) return store.accounts.accounts()
  const keys = await storedKeysOf(store, env, value)
  if (keys.length === 0) throw noStoredAccount(value)
  return keys
}

export const accountName = ({ provider, account }: AccountKey) => `${provider}:${account}`

export const WRITE_HELP = "the account it acts as: provider:account, such as telegram:1 or email:personal"

export interface WriteOptions {
  account?: string
}

export const writeOptions = (command: Command, help = WRITE_HELP): Command =>
  command.option("--account <account>", help)

export const writeAccountOf = (options: WriteOptions, _warn: (text: string) => void): string | undefined => {
  const { account } = options
  if (account !== undefined && (!account.includes(":") || account.startsWith("group:")))
    throw new CliError("validation_error", `--account takes provider:account, such as telegram:${account}`)
  return account
}

/** The one account a write acts as. */
export const writeAccount = (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  options: WriteOptions,
  warn: (text: string) => void,
): Promise<AccountKey> => oneAccountOf(store, env, writeAccountOf(options, warn), "--account")
