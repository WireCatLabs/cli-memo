import { chmodSync, copyFileSync, existsSync } from "node:fs"
import type { QueryAst } from "@wirecat/cli-base/query"
import {
  ENVELOPE,
  envelopeBox,
  type MailRule,
  type MailRuleMatch,
  ruleInput,
  storedMailRule,
  storedMailRuleSet,
} from "@wirecat/cli-core/mail"
import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { configPath, loadConfig, updateConfig } from "../config.js"
import type { MailAccountConfig } from "./accounts.js"

export const accountKey = (address: string): AccountKey => ({ provider: "email", account: address.toLowerCase() })

const accountIdOf = (store: MessageStore, address: string) =>
  store.accounts.saveAccount(accountKey(address), { name: address })

const PROTECTED_REASON = /never remove/i

/**
 * Rules lived in config.json until 0.32.0. The first run that opens the store copies them in, checks they all
 * arrived, and only then drops them from the config, after a backup beside it; a run killed halfway repeats the
 * copy, which replaces each rule by its conditions.
 */
export const moveConfigRules = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  say: (line: string) => void,
): Promise<void> => {
  const accounts = (loadConfig(env).mail?.accounts ?? []).filter(({ rules }) => (rules?.length ?? 0) > 0)
  if (accounts.length === 0) return
  const path = configPath(env)
  const backup = `${path}.${new Date().toISOString().replace(/[:.]/g, "-")}.before-rules-in-store`
  if (existsSync(path)) {
    copyFileSync(path, backup)
    chmodSync(backup, 0o600)
  }
  const moved = new Map<string, number>()
  for (const account of accounts) {
    const rules = account.rules ?? []
    const accountId = await accountIdOf(store, account.address)
    for (const rule of rules)
      await store.mail.rules.upsert(
        accountId,
        ruleInput({ ...rule, ...(PROTECTED_REASON.test(rule.reason ?? "") ? { protected: true } : {}) }),
        Date.now(),
      )
    const inStore = new Set(
      (await store.mail.rules.list(accountId)).map(({ conditions }) => JSON.stringify(conditions)),
    )
    const missing = rules.filter((rule) => !inStore.has(JSON.stringify(ruleInput(rule).conditions)))
    if (missing.length) throw new Error(`${missing.length} of ${account.name}'s rules did not reach the store`)
    await assignEnvelopes(store, accountId)
    moved.set(account.name, rules.length)
  }
  updateConfig(
    (config) => ({
      ...config,
      mail: {
        ...config.mail,
        accounts: (config.mail?.accounts ?? []).map(({ rules: _, ...account }) => account),
      },
    }),
    env,
  )
  for (const [name, count] of moved)
    say(`memo: moved ${count} mail rules of ${name} from the config into the store; the old config is ${backup}\n`)
}

/** Envelope emails recorded before 0.32.0 know their rule only by the mailbox it gave them. */
const assignEnvelopes = async (store: MessageStore, accountId: number): Promise<void> => {
  const byBox = new Map<string, number>()
  for (const stored of await store.mail.rules.list(accountId)) {
    const rule = storedMailRule(stored)
    if (rule?.action === ENVELOPE && rule.id !== undefined) byBox.set(envelopeBox(rule.match).externalId, rule.id)
  }
  if (byBox.size === 0) return
  const emails = new Map<number, string[]>()
  for (const { externalId, mailboxes } of await store.mail.emailRefs({ accountId }))
    for (const box of mailboxes) {
      const ruleId = byBox.get(box.externalId)
      if (ruleId !== undefined) emails.set(ruleId, [...(emails.get(ruleId) ?? []), externalId])
    }
  for (const [ruleId, ids] of emails) await store.mail.rules.assign(accountId, ruleId, ids, Date.now())
}

const loaded = new WeakMap<MessageStore, Map<string, MailRule[]>>()

/** One account's rules, read once per opened store and moved there from the config first if needed. */
export const rulesOf = async (
  store: MessageStore,
  account: Pick<MailAccountConfig, "address">,
  env: NodeJS.ProcessEnv,
  say: (line: string) => void,
  query?: QueryAst,
): Promise<MailRule[]> => {
  const key = account.address.toLowerCase()
  const byAccount = loaded.get(store) ?? new Map<string, MailRule[]>()
  loaded.set(store, byAccount)
  const cached = byAccount.get(key)
  if (cached !== undefined && query === undefined) return cached
  await moveConfigRules(store, env, say)
  const { rules, unreadable } = await storedMailRuleSet(store, account, query)
  // mail reports these in its sync answer; a build that reads them would decide mail differently.
  if (unreadable.length)
    say(
      `memo: ${unreadable.length} stored mail rules of ${account.address} are left out, this memo does not know their ` +
        `${[...new Set(unreadable.map(({ why }) => why))].join(", ")}; update memo\n`,
    )
  if (query === undefined) byAccount.set(key, rules)
  return rules
}

export const saveRule = async (store: MessageStore, address: string, rule: MailRule): Promise<MailRule> => {
  const stored = await store.mail.rules.upsert(await accountIdOf(store, address), ruleInput(rule), Date.now())
  loaded.delete(store)
  return storedMailRule(stored) ?? rule
}

export const removeRule = async (store: MessageStore, address: string, match: MailRuleMatch): Promise<boolean> => {
  const { conditions } = ruleInput({ match, action: "skip", decided_at: new Date().toISOString() })
  const removed = await store.mail.rules.remove(await accountIdOf(store, address), conditions)
  loaded.delete(store)
  return removed
}

export const ruleCounts = async (store: MessageStore, address: string) =>
  new Map(
    (await store.mail.rules.counts(await accountIdOf(store, address))).map(({ ruleId, emails, bytes }) => [
      ruleId,
      { emails, bytes },
    ]),
  )
