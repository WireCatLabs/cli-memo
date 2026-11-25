import type { DealKind } from "@wirecat/cli-core"
import { canonicalPersonContext } from "@wirecat/cli-core/services"
import type { LinkEvidence, MessageStore } from "@wirecat/cli-core/store"
import type { PersonMerge } from "@wirecat/cli-core/store/areas"
import { crmViewingAll } from "../store/crm-viewer.js"
import { groupScopeOf } from "../store/group.js"

/** `none` (`--brief`) is the match and its evidence; `brief`, the default, adds each side; `full` more of each. */
export type Detail = "none" | "brief" | "full"

const SIZE = { brief: { last: 2, business: 3, text: 120 }, full: { last: 6, business: 10, text: 400 } }

const WEAK_WORDS: Record<string, string> = {
  landline: "the number is a landline, anyone's at that office",
  shared: "more people have it",
  company: "it is a company's line or mailbox",
  "role-address": "it is a role address such as info@",
  "no-reply": "it is a no-reply address",
  "one-source": "only one source gives it",
  "not-own-number": "only a CRM or a card gives the number, which is someone's word",
  "nothing-shared": "they share no phone or address: a name or the agent's word alone",
  owner: "one of them is you",
  rejected: "you turned this pair down before",
  "propose-only": "agent_merges is propose",
}

/** Why a match is not strong enough for an agent to merge, in words. */
export const weakText = (evidence: LinkEvidence): string => {
  const [fact] = evidence.facts
  const why = WEAK_WORDS[evidence.weak ?? ""] ?? evidence.weak ?? "not strong"
  return fact && evidence.weak !== "nothing-shared" ? `${fact.kind} ${fact.value}: ${why}` : why
}

export const strongText = (evidence: LinkEvidence): string => {
  const fact = evidence.facts.find(({ strong }) => strong)
  return fact ? `${fact.kind} ${fact.value} (${fact.holders.flat().join(", ")})` : "strong evidence"
}

/** A side of a match as the owner compares it: who they are, where from, the last contact, and their business. */
export const sideOf = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  person: string,
  detail: "brief" | "full",
  deniedKinds: readonly DealKind[],
) => {
  const size = SIZE[detail]
  const scope = await groupScopeOf(store, env)
  const context = await canonicalPersonContext(store, person, {
    messages: size.last,
    limit: size.business,
    deniedKinds,
    viewing: await crmViewingAll(store),
    ...(scope === undefined ? {} : { accounts: scope.accounts }),
  })
  const record = context.person
  const cut = (text: string | null) => (text === null ? null : text.replace(/\s+/g, " ").trim().slice(0, size.text))
  const messages = [...context.recent.direct, ...context.recent.groups].map((message) => ({
    at: message.timestamp,
    kind: "message" as const,
    source: message.provider,
    chat: message.chatTitle,
    from_me: message.outgoing,
    text: cut(message.text),
    ref: message.locator,
  }))
  const meetings = context.meetings.map((meeting) => ({
    at: meeting.startedAt,
    kind: meeting.call ? ("call" as const) : ("meeting" as const),
    source: meeting.account.provider,
    chat: null,
    from_me: null,
    text: cut(meeting.title),
    ref: meeting.ref,
  }))
  const last = [...messages, ...meetings]
    .filter((one) => one.at !== null)
    .sort((a, b) => (b.at as string).localeCompare(a.at as string))
    .slice(0, size.last)
  const names = (items: { name: string | null; ref: string }[]) => items.map(({ name, ref }) => name ?? ref)
  return {
    person: `person:${record.uid}`,
    name: record.name,
    display_name: record.displayName ?? null,
    identities: record.identities.map((identity) => ({
      identity: `${identity.provider}:${identity.id}`,
      source: identity.provider,
      name: identity.name,
      ...(detail === "full"
        ? {
            username: identity.username,
            phones: identity.phones ?? [],
            emails: identity.emails ?? [],
            accounts: identity.seenIn.map(({ account }) => account),
          }
        : {}),
    })),
    last,
    organizations: names(context.business.organizations.items),
    deals: names(context.business.deals.items),
  }
}

export type Side = Awaited<ReturnType<typeof sideOf>>

/** An agent's merge as the owner reviews it, with the move that undoes it. */
export const agentMergeAnswer = (merge: PersonMerge) => ({
  id: merge.id,
  kind: "agent_merge" as const,
  person: `person:${merge.to}`,
  from: `person:${merge.from}`,
  identities: merge.identities.map(({ provider, id, name }) => ({ identity: `${provider}:${id}`, name })),
  by: merge.agent?.bot ?? merge.by,
  run: merge.agent?.run ?? null,
  reason: merge.agent?.reason ?? null,
  evidence: merge.agent?.evidence ?? null,
  proposal: merge.agent?.proposal ?? null,
  at: merge.at,
  undo: `memo people unmerge ${merge.id}`,
})

export const sideLines = (side: Side): string[] => [
  `    ${side.person} ${side.display_name ?? side.name ?? ""}`.trimEnd(),
  `      ${side.identities.map(({ identity, name }) => (name ? `${identity} (${name})` : identity)).join(", ")}`,
  ...side.last.map(
    (one) => `      ${one.at?.slice(0, 16).replace("T", " ")}  ${one.source} ${one.kind}: ${one.text ?? ""}`,
  ),
  ...(side.organizations.length ? [`      organizations: ${side.organizations.join(", ")}`] : []),
  ...(side.deals.length ? [`      deals: ${side.deals.join(", ")}`] : []),
]
