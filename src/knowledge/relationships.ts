import type { QueryRegistry } from "@wirecat/cli-base/query"
import { queryTerms, termField } from "@wirecat/cli-core/cli"
import { proposalRegistry } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { labelsFor, proposerName } from "../review/review.js"

export const RELATIONSHIP_QUERY = {
  entity: "relationship",
  backend: "native",
  fields: [
    termField("about", "ref", 'about:"project:1"', {
      relation: "the person, organization or project at either end",
    }),
    termField("confirmed", "enum", "confirmed:false", { values: ["true", "false"] }),
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
      status: "proposed" as const,
      proposer: proposerName(row.proposedBy),
      score: row.score,
      createdAt: row.createdAt,
    })),
  }
}

export const listRelationships = async (store: MessageStore, words: readonly string[]) => {
  const terms = queryTerms(words, RELATIONSHIP_QUERY, "relationships list")
  const about = terms.get("about")
  const confirmed = terms.get("confirmed")
  const found =
    confirmed === "false"
      ? await pending(store, about)
      : {
          hasMore: false,
          items: (await store.knowledge.relations(null, about))
            .filter((one) => confirmed === undefined || one.confirmed)
            .map((one) => ({ ...one, status: one.confirmed ? ("confirmed" as const) : ("proposed" as const) })),
        }
  const label = await labelsFor(
    store,
    found.items.flatMap((one) => [one.from, one.to]),
  )
  return {
    hasMore: found.hasMore,
    limit: confirmed === "false" ? PENDING_LIMIT : Math.max(1, found.items.length),
    items: found.items.map((one) => ({ ...one, fromTitle: label(one.from), toTitle: label(one.to) })),
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
            [one.kind, one.role && `as ${one.role}`, one.purpose && `for ${one.purpose}`].filter(Boolean).join(" "),
            "proposer" in one ? `proposed by ${one.proposer}` : one.confirmed ? "" : "suggested",
          ]
            .filter(Boolean)
            .join("  "),
        )
        .join("\n")
    : "no relationships"
