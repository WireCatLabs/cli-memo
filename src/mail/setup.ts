import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { parse } from "smol-toml"
import { type Config, updateConfig } from "../config.js"
import { himalaya } from "./himalaya.js"

type Account = NonNullable<Config["mail"]>["accounts"][number]

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Himalaya 2.2.1's SASL tables (`src/config.rs`): PLAIN names its login `authcid` or `username`, the rest `username`.
const SASL = ["plain", "login", "oauthbearer", "xoauth2", "scram-sha-256"]

const loginOf = (account: Record<string, unknown>, backend: "imap" | "smtp"): unknown => {
  const sasl = object(object(account[backend]).sasl)
  for (const mechanism of SASL) {
    const { username, authcid } = object(sasl[mechanism])
    if (username !== undefined || authcid !== undefined) return username ?? authcid
  }
  return undefined
}

/** Himalaya sends mail without `email` set, so many accounts name their address only as the IMAP or SMTP login. */
const addressOf = (account: Record<string, unknown>, config: Record<string, unknown>): unknown =>
  account.email ??
  account.from ??
  config.email ??
  config.from ??
  [loginOf(account, "imap"), loginOf(account, "smtp")].find((login) => typeof login === "string" && ADDRESS.test(login))

const shown = (path: string, env: NodeJS.ProcessEnv): string => {
  const home = env.HOME ?? env.USERPROFILE
  return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

const configuration = (env: NodeJS.ProcessEnv, given?: string): string => {
  const home = env.HOME ?? env.USERPROFILE
  if (!home) throw new CliError("configuration_error", "HOME is required for Himalaya configuration discovery")
  const explicit = given ?? env.HIMALAYA_CONFIG
  if (explicit) {
    const path = explicit.replace(/^~(?=\/|$)/, home)
    if (path.includes(":") && !/^[A-Za-z]:[\\/]/.test(path))
      throw new CliError("validation_error", "give one Himalaya config file for account setup")
    return path
  }
  const candidates = [
    join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "himalaya", "config.toml"),
    join(home, ".himalayarc"),
  ]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new CliError("configuration_error", "set up Himalaya first, or set HIMALAYA_CONFIG to its file")
  return found
}

export const checkMailAccount = async (
  env: NodeJS.ProcessEnv,
  input: { name?: string; address?: string; config?: string },
): Promise<{ name: string; address: string }> => {
  const path = configuration(env, input.config)
  const output = await himalaya(env)(["account", "list", "--json", "--config", path])
  let listed: unknown
  try {
    listed = JSON.parse(output)
  } catch {
    throw new CliError("invalid_response", "Himalaya account list did not return JSON")
  }
  const rows = object(listed).accounts
  if (!Array.isArray(rows) || rows.some((row) => typeof object(row).name !== "string"))
    throw new CliError("invalid_response", "Himalaya account list returned no accounts array")
  const names = rows.map((row) => String(object(row).name))
  if (!input.name || !names.includes(input.name))
    throw new CliError(
      "validation_error",
      `name one Himalaya account explicitly; choices: ${names.join(", ") || "none"}`,
    )
  let config: Record<string, unknown>
  try {
    config = parse(readFileSync(path, "utf8"))
  } catch {
    throw new CliError("configuration_error", "the selected Himalaya TOML configuration cannot be read")
  }
  const account = object(object(config.accounts)[input.name])
  const configured = addressOf(account, config)
  if (configured === undefined)
    throw new CliError(
      "configuration_error",
      `Himalaya's account ${input.name} names no email address, and its login is not one. ` +
        `Add this line under [accounts.${input.name}] in ${shown(path, env)}: email = "you@example.com"`,
    )
  if (typeof configured !== "string" || !ADDRESS.test(configured))
    throw new CliError(
      "configuration_error",
      `the email in Himalaya's accounts.${input.name} is not an address; fix it in ${shown(path, env)}`,
    )
  if (!input.address || input.address.toLowerCase() !== configured.toLowerCase())
    throw new CliError("validation_error", `the address must match the selected Himalaya account's email`)
  return { name: input.name, address: configured }
}

export const addMailAccount = async (
  env: NodeJS.ProcessEnv,
  input: { name?: string; address?: string; config?: string; mode: "gmail" | "imap"; folders?: string[] },
): Promise<Account> => {
  const checked = await checkMailAccount(env, input)
  const account: Account = { ...checked, mode: input.mode, ...(input.folders ? { folders: input.folders } : {}) }
  updateConfig((config) => {
    const accounts = config.mail?.accounts ?? []
    if (
      accounts.some((one) => one.name === checked.name || one.address.toLowerCase() === checked.address.toLowerCase())
    )
      throw new CliError("validation_error", "this account name or email is already in Memo; use mail check")
    return { ...config, mail: { ...config.mail, accounts: [...accounts, account] } }
  }, env)
  return account
}
