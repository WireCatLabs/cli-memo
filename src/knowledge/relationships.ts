import { CliError } from "@wirecat/cli-base"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { inverseOf, RELATION_KINDS, rolesOf, STANDINGS } from "@wirecat/cli-core"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import { proposalRegistry } from "@wirecat/cli-core/services"
import type { KnowledgeRelation, MessageStore } from "@wirecat/cli-core/store"
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
    termField("at", "kw", "at:2026-10-01"),
    termField("include", "enum", "include:ended", { values: ["ended"] }),
  ],
} as const satisfies QueryRegistry

const PENDING_LIMIT = 50

interface Payload {
  kind?: string
  purpose?: string
}

/** The pending ones are the review's `relationship` rows, so both commands list the same proposals. */
const pending = async (store: MessageStore, about: string | undefined) => {
  const found = await proposalRegistry(store).list({
    kinds: ["relationship"],
    status: "proposed",
    ...(about?.startsWith("project:") ? { project: about } : {}),
    limit: PENDING_LIMIT,
    offset: 0,
  })
  const payloads = new Map(
    (await store.proposedActions.list({ kinds: ["relationship"], status: "proposed", limit: 500 })).map((one) => [
      one.id,
      (one.payload ?? {}) as Payload,
    ]),
  )
  const rows = found.items.filter((row) => about === undefined || row.subject === about || row.object === about)
  return {
    hasMore: found.hasMore,
    items: rows.map((row) => ({
      id: row.id,
      from: row.subject,
      to: row.object,
      kind: payloads.get(row.id)?.kind ?? null,
      role: row.summary,
      purpose: payloads.get(row.id)?.purpose ?? null,
      evidence: row.reason,
      confirmed: false,
      standing: "proposed" as const,
      status: "proposed" as const,
      proposer: proposerName(row.proposedBy),
      score: row.score,
      createdAt: row.createdAt,
    })),
  }
}

const DAY = 86_400_000

/** `at:2026-10-01`: held at some time on that UTC day. A relationship with no dates is taken as holding. */
const heldOn = (day: string) => {
  const start = Date.parse(`${day}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(start))
    throw new CliError("validation_error", `at: takes a day, such as at:2026-10-01 — not "${day}"`, {
      reason: "input.invalid",
    })
  return (one: KnowledgeRelation) =>
    (one.startsAt === undefined || Date.parse(one.startsAt) < start + DAY) &&
    (one.endsAt === undefined || Date.parse(one.endsAt) > start)
}

const typeOf = (ref: string) => ref.split(":")[0] ?? ""

/** A role a list gives for this pair that the stored one is not on: kept as written, marked `custom`. */
const isCustom = (one: KnowledgeRelation) => {
  if (one.role === null) return false
  const roles = rolesOf(one.kind, typeOf(one.from), typeOf(one.to))
  return roles !== undefined && !roles.includes(one.role)
}

/** A row as listed: a relationship with its standing, or a proposal waiting for the owner. */
export interface RelationshipRow {
  id: string
  from: string
  to: string | null
  kind: string | null
  role: string | null
  purpose: string | null
  standing: string
  account?: string
  position?: string
  proposer?: string
  /** A role off the registry's list for this pair: written before the lists, kept as written. */
  custom?: true
  /** With `about:`: whether the asked-about end is where it points from or to. */
  direction?: "from" | "to"
  /** What the relationship is called from the asked-about end: `manages` for a `reports-to` read backwards. */
  label?: string
  fromTitle: string | null
  toTitle: string | null
  [field: string]: unknown
}

export interface RelationshipPage {
  limit: number
  page: number
  /** The accounts in scope: a source's relationship from any other is left out; the owner's are always in. */
  accounts?: readonly string[]
}

/**
 * `relationships list` and its filters. cli-core says what each relationship is and its standing; this picks the
 * rows asked for and, with `about:`, says which way each one points and what it is called read backwards.
 */
export const listRelationships = async (
  store: MessageStore,
  words: readonly string[],
  { limit, page, accounts }: RelationshipPage = { limit: 100, page: 1 },
): Promise<{ hasMore: boolean; limit: number; page?: number; items: RelationshipRow[] }> => {
  const terms = queryTerms(words, RELATIONSHIP_QUERY, "relationships list")
  const about = terms.get("about")
  const from = terms.get("from")
  const to = terms.get("to")
  const kind = terms.get("kind")
  const role = terms.get("role")
  const at = terms.get("at")
  const standing = terms.get("confirmed") === "false" ? "proposed" : terms.get("standing")
  const label = (refs: (string | null)[]) =>
    labelsFor(
      store,
      refs.filter((ref): ref is string => ref !== null),
    )
  if (standing === "proposed") {
    const found = await pending(store, about ?? from ?? to)
    const items = found.items.filter(
      (one) =>
        (from === undefined || one.from === from) &&
        (to === undefined || one.to === to) &&
        (kind === undefined || one.kind === kind),
    )
    const named = await label(items.flatMap((one) => [one.from, one.to]))
    return {
      hasMore: found.hasMore,
      limit: PENDING_LIMIT,
      items: items.map((one) => ({
        ...one,
        fromTitle: named(one.from),
        toTitle: one.to === null ? null : named(one.to),
      })),
    }
  }
  const held = at === undefined ? undefined : heldOn(at)
  const ended = terms.get("include") === "ended" || standing === "ended" || at !== undefined
  const confirmed = terms.get("confirmed")
  const rows = (await store.knowledge.relations(null, about ?? from ?? to)).filter(
    (one) =>
      (from === undefined || one.from === from) &&
      (to === undefined || one.to === to) &&
      (kind === undefined || one.kind === kind) &&
      (role === undefined || one.role === role) &&
      (standing === undefined || one.standing === standing) &&
      (confirmed === undefined || one.confirmed === (confirmed === "true")) &&
      (ended || one.standing !== "ended") &&
      (held === undefined || held(one)) &&
      (accounts === undefined || one.account === undefined || accounts.includes(one.account)),
  )
  const shown = rows.slice((page - 1) * limit, page * limit)
  const named = await label(shown.flatMap((one) => [one.from, one.to]))
  return {
    hasMore: rows.length > page * limit,
    limit,
    page,
    items: shown.map((one) => ({
      ...one,
      // A CRM's link is unconfirmed but no proposal: its status is its standing, `reported`.
      status: one.standing,
      ...(isCustom(one) ? { custom: true } : {}),
      ...(about === undefined
        ? {}
        : one.from === about
          ? { direction: "from" as const, label: one.kind }
          : { direction: "to" as const, label: inverseOf(one.kind) ?? one.kind }),
      fromTitle: named(one.from),
      toTitle: named(one.to),
    })),
  }
}

export const relationshipsText = (items: readonly RelationshipRow[]) =>
  items.length
    ? items
        .map((one) =>
          [
            one.id,
            `${one.fromTitle} → ${one.toTitle}`,
            [
              one.direction === "to" ? one.label : one.kind,
              one.role && `as ${one.role}${one.custom ? " (custom)" : ""}`,
              one.position && `(${one.position})`,
              one.purpose && `for ${one.purpose}`,
            ]
              .filter(Boolean)
              .join(" "),
            one.proposer !== undefined
              ? `proposed by ${one.proposer}`
              : [one.standing, one.account && `by ${one.account}`].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join("  "),
        )
        .join("\n")
    : "no relationships"
