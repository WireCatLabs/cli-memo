import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { byEngagement, RELATION_KINDS, type RelationKind, STANDINGS, type Standing } from "@wirecat/cli-core"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import type { AccountKey, MessageStore, Proposer } from "@wirecat/cli-core/store"
import { labelsFor, proposerName } from "../review/review.js"
import { guardOf } from "../store/guard.js"

export const RELATIONSHIP_QUERY = {
  entity: "relationship",
  backend: "native",
  fields: [
    termField("about", "ref", 'about:"person:5"', {
      relation: "the person, organization, project, deal or lead at either end; each row says its direction",
    }),
    termField("from", "ref", 'from:"person:5"', { relation: "the end that belongs, reports or relates" }),
    termField("to", "ref", 'to:"person:5"', { relation: "the end it belongs, reports or relates to" }),
    termField("kind", "enum", "kind:reports-to", { values: RELATION_KINDS }),
    termField("role", "kw", "role:decision-maker"),
    termField("standing", "enum", "standing:reported", { values: STANDINGS }),
    termField("confirmed", "enum", "confirmed:false", { values: ["true", "false"] }),
    termField("at", "kw", "at:2026-10-01", { relation: "held at the start of that UTC day" }),
    termField("include", "enum", "include:ended", { values: ["ended"] }),
  ],
} as const satisfies QueryRegistry

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** `at:2026-10-01`: held at the start of that UTC day. */
const atOf = (day: string): number => {
  const at = Date.parse(`${day}T00:00:00Z`)
  if (!DAY.test(day) || Number.isNaN(at))
    throw new CliError("validation_error", `at: takes a day, such as at:2026-10-01 — not "${day}"`, {
      reason: "input.invalid",
    })
  return at
}

export interface RelationshipPage {
  limit: number
  page: number
  /** The accounts in scope: a source's relationship from any other is left out; the owner's are always in. */
  accounts?: AccountKey[]
  /** Kinds memo's permissions deny: no relationship with a deal or a lead end. */
  deniedKinds?: string[]
}

/** `relationships list`: cli-core filters and pages the links and the pending proposals together. */
export const listRelationships = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  words: readonly string[],
  { limit, page, accounts, deniedKinds }: RelationshipPage = { limit: 100, page: 1 },
) => {
  const terms = queryTerms(words, RELATIONSHIP_QUERY, "relationships list")
  const confirmed = terms.get("confirmed")
  const standing = (terms.get("standing") ??
    (confirmed === "false" ? "proposed" : confirmed === "true" ? "confirmed" : undefined)) as Standing | undefined
  const at = terms.get("at")
  const found = await store.knowledge.listRelations({
    ...(terms.has("kind") ? { kind: terms.get("kind") as RelationKind } : {}),
    ...(terms.has("role") ? { role: terms.get("role") as string } : {}),
    ...(terms.has("from") ? { from: terms.get("from") as string } : {}),
    ...(terms.has("to") ? { to: terms.get("to") as string } : {}),
    ...(terms.has("about") ? { about: terms.get("about") as string } : {}),
    ...(standing === undefined ? {} : { standing }),
    ...(at === undefined ? {} : { at: atOf(at) }),
    ...(terms.get("include") === "ended" ? { includeEnded: true } : {}),
    ...(accounts === undefined ? {} : { accounts }),
    ...(deniedKinds?.length ? { deniedKinds } : {}),
    limit,
    page,
  })
  // Under the lock a row whose end the group cannot show, a person only an outside account saw, is left out.
  const guard = await guardOf(store, env)
  const rows = []
  for (const one of found.items)
    if (guard === undefined || ((await guard.visible(one.from)) && (await guard.visible(one.to)))) rows.push(one)
  const label = await labelsFor(
    store,
    rows.flatMap((one) => [one.from, one.to]),
  )
  return {
    hasMore: found.hasMore,
    limit,
    page,
    items: await Promise.all(
      byEngagement(rows).map(async (one) => ({
        ...one,
        status: one.standing,
        // Who proposed it is the review's to name; the list says it beside the proposal.
        ...(one.source === "proposal"
          ? { proposer: proposerName((await store.proposedActions.get(one.id)).proposedBy as Proposer) }
          : {}),
        fromTitle: label(one.from),
        toTitle: label(one.to),
      })),
    ),
  }
}

type Listed = Awaited<ReturnType<typeof listRelationships>>["items"][number]

export const relationshipsText = (items: readonly Listed[]) =>
  items.length
    ? items
        .map((one) =>
          [
            one.id,
            `${one.fromTitle} → ${one.toTitle}`,
            [
              one.direction === "incoming" ? (one.inverse ?? one.kind) : one.kind,
              one.role && `as ${one.role}${one.custom ? " (custom)" : ""}`,
              "roleNote" in one && one.roleNote && `(${one.roleNote})`,
              one.position && `(${one.position})`,
              one.purpose && `for ${one.purpose}`,
              "engagement" in one && one.engagement && `engagement ${one.engagement}`,
            ]
              .filter(Boolean)
              .join(" "),
            "proposer" in one
              ? `proposed by ${one.proposer}`
              : [one.standing, one.account && `by ${one.account}`].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join("  "),
        )
        .join("\n")
    : "no relationships"
