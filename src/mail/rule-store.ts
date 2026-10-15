import { chmodSync, copyFileSync, existsSync } from "node:fs"
import type { AccountKey, MessageStore, MailRule as StoredRule } from "@wirecat/cli-core/store"
import { configPath, loadConfig, updateConfig } from "../config.js"
import type { MailAccountConfig } from "./accounts.js"
import { PRESET_NAMES, type PresetName } from "./presets.js"
import { conditionKeys, ENVELOPE, envelopeBox, type MailAction, type MailRule, type MailRuleMatch } from "./rules.js"

const STORE_ACTION: Record<MailAction, string> = { keep: "full", envelope: "envelope", skip: "skip" }
const ACTION_OF: Record<string, MailAction> = { full: "keep", envelope: "envelope", skip: "skip" }

const LOWER: readonly (keyof MailRuleMatch)[] = ["from", "domain", "list_id", "subject"]

const conditionsOf = (match: MailRuleMatch): Record<string, string | number | boolean> =>
  Object.fromEntries(
    conditionKeys(match).map((key) => {
      const value = match[key]
      return [
        key,
        LOWER.includes(key) && typeof value === "string" ? value.toLowerCase() : (value as string | number | boolean),
      ]
    }),
  )

export const ruleInput = (rule: MailRule, source = rule.source ?? "owner") => ({
  conditions: conditionsOf(rule.match),
  actions: { store: STORE_ACTION[rule.action], ...(rule.tags?.length ? { tags: rule.tags } : {}) },
  protected: rule.protected === true,
  source,
  reason: rule.reason ?? null,
  decidedAt: Date.parse(rule.decided_at) || Date.now(),
})

const KINDS: Record<keyof MailRuleMatch, "string" | "number" | "boolean"> = {
  from: "string",
  domain: "string",
  list_id: "string",
  subject: "string",
  older_than_days: "number",
  larger_than_bytes: "number",
  has_attachments: "boolean",
  label: "string",
  unread: "boolean",
  bulk: "boolean",
  score_at_least: "number",
  preset: "string",
}

const fromStored = (stored: StoredRule): MailRule | undefined => {
  const action = ACTION_OF[String(stored.actions.store)]
  const entries = Object.entries(stored.conditions as Record<string, unknown>)
  // A condition memo does not know yet, from a newer memo, is left to that memo rather than misread.
  const known = entries.every(
    ([key, value]) =>
      key in KINDS &&
      typeof value === KINDS[key as keyof MailRuleMatch] &&
      !(key === "preset" && !PRESET_NAMES.includes(value as PresetName)),
  )
  if (action === undefined || !known || entries.length === 0) return undefined
  const tags = Array.isArray(stored.actions.tags) ? stored.actions.tags.filter((tag) => typeof tag === "string") : []
  return {
    id: stored.id,
    match: Object.fromEntries(entries) as MailRuleMatch,
    action,
    ...(tags.length ? { tags: tags as string[] } : {}),
    ...(stored.reason === null ? {} : { reason: stored.reason }),
    ...(stored.protected ? { protected: true } : {}),
    ...(stored.source === "owner" ? {} : { source: stored.source }),
    decided_at: new Date(stored.decidedAt).toISOString(),
  }
}

export const accountKey = (address: string): AccountKey => ({ provider: "email", account: address.toLowerCase() })

const accountIdOf = (store: MessageStore, address: string) => store.saveAccount(accountKey(address), { name: address })

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
    const rule = fromStored(stored)
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
): Promise<MailRule[]> => {
  const key = account.address.toLowerCase()
  const byAccount = loaded.get(store) ?? new Map<string, MailRule[]>()
  loaded.set(store, byAccount)
  const cached = byAccount.get(key)
  if (cached !== undefined) return cached
  await moveConfigRules(store, env, say)
  const accountId = await accountIdOf(store, account.address)
  const rules = (await store.mail.rules.list(accountId)).flatMap((stored) => fromStored(stored) ?? [])
  byAccount.set(key, rules)
  return rules
}

export const saveRule = async (store: MessageStore, address: string, rule: MailRule): Promise<MailRule> => {
  const stored = await store.mail.rules.upsert(await accountIdOf(store, address), ruleInput(rule), Date.now())
  loaded.delete(store)
  return fromStored(stored) ?? rule
}

export const removeRule = async (store: MessageStore, address: string, match: MailRuleMatch): Promise<boolean> => {
  const removed = await store.mail.rules.remove(await accountIdOf(store, address), conditionsOf(match))
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
