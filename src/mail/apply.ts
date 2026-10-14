import type { AccountKey, MessageStore } from "@wirecat/cli-core/store"
import { mailFolders } from "./accounts.js"
import type { MailAccount } from "./import.js"
import { decide, ENVELOPE, envelopeBox, type MailRule, type MailRuleMatch, sameMatch } from "./rules.js"
import type { Listed, MailSource } from "./source.js"

export interface RuleEffect {
  rule: MailRule
  emails: number
  /** Text this rule's emails hold in the store: bodies and attachment text. */
  bytes: number
}

export interface ApplyResult {
  account: string
  applied: boolean
  listed: number
  /** Stored in full, matched by an envelope rule: cut to envelopes, or would be. */
  envelopes: number
  bytes: number
  /** Stored in full, matched only by a skip rule: left as stored, since removing them is another decision. */
  skipMatched: number
  rules: RuleEffect[]
}

const textBytes = (text: string | null | undefined) => (text ? Buffer.byteLength(text) : 0)

/**
 * Cuts mail stored in full that an envelope rule now matches down to what an envelope import stores. Matching
 * reads the account's headers from its source, as import does: List-Id is not stored with a full email.
 */
export const applyRules = async ({
  store,
  source,
  account,
  since,
  apply,
  now = Date.now,
}: {
  store: MessageStore
  source: MailSource
  account: MailAccount
  since: Date
  apply: boolean
  now?: () => number
}): Promise<ApplyResult> => {
  const startedAt = now()
  const key: AccountKey = { provider: "email", account: account.address.toLowerCase() }
  const rules = account.rules ?? []
  const effects = rules
    .filter(({ action }) => action === ENVELOPE)
    .map((rule): RuleEffect => ({ rule, emails: 0, bytes: 0 }))
  const result: ApplyResult = {
    account: key.account,
    applied: apply,
    listed: 0,
    envelopes: 0,
    bytes: 0,
    skipMatched: 0,
    rules: effects,
  }
  if (effects.length === 0) return result
  const stored = await store.storedAccount(key).catch(() => null)
  if (stored === null) return result

  const listed = new Map<string, Listed>()
  for (const folder of mailFolders(account))
    for (const item of await source.list(since, folder, { headers: true })) listed.set(item.messageId, item)
  result.listed = listed.size

  const full = new Set(
    (await store.mail.emailRefs({ accountId: stored.id }))
      .filter(({ deleted, mailboxes }) => !deleted && !mailboxes.some(({ kind }) => kind === ENVELOPE))
      .map(({ externalId }) => externalId),
  )
  const effectOf = (match: MailRuleMatch) => effects.find(({ rule }) => sameMatch(rule.match, match)) as RuleEffect
  const chosen: { item: Listed; rule: MailRule }[] = []
  for (const item of listed.values()) {
    if (!full.has(item.messageId)) continue
    const rule = decide(rules, item.headers)
    if (rule?.action === "skip") result.skipMatched++
    if (rule?.action === ENVELOPE) chosen.push({ item, rule })
  }

  for (const { item, rule } of chosen) {
    const email = await store.mail.email(stored.id, item.messageId)
    if (email === null) continue
    const bytes =
      textBytes(email.bodyText) +
      textBytes(email.bodyHtml) +
      email.attachments.reduce((sum, { text }) => sum + textBytes(text), 0)
    const effect = effectOf(rule.match)
    effect.emails++
    effect.bytes += bytes
    result.envelopes++
    result.bytes += bytes
    if (!apply) continue
    const [placed] = await store.mail.inThreads(stored.id, [item.messageId])
    const subject = email.subject ?? item.headers?.subject
    const listId = item.headers?.listId
    await store.mail.saveThread({
      accountId: stored.id,
      externalId: placed?.threadExternalId ?? item.threadId,
      now: startedAt,
      emails: [
        {
          externalId: item.messageId,
          subject: null,
          from: email.fromAddress === null ? null : { address: email.fromAddress, name: email.fromName },
          sentAt: email.sentAt,
          bodyText: null,
          bodyHtml: null,
          snippet: null,
          size: email.size ?? item.size ?? null,
          mailboxes: [envelopeBox(rule.match)],
          attachments: [],
          metadata: {
            ...email.metadata,
            rule: { action: rule.action, match: { ...rule.match } },
            ...(subject ? { subject } : {}),
            ...(listId ? { listId } : {}),
          },
        },
      ],
    })
  }
  return result
}
