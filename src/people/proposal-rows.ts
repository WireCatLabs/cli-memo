import { CliError } from "@wirecat/cli-base"
import type { IdentityLinkRow, IdentitySplitRow, MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { whoRuns } from "../author.js"

/** The owner's moves: refused for anyone else before anything is read, whatever the store would say. */
export const asOwner = async (command: Command, env: NodeJS.ProcessEnv, question: string): Promise<"owner"> => {
  const options = command.opts<{ asOwner?: boolean }>()
  const who = await whoRuns(command, env, { asOwner: options.asOwner, question })
  if (who !== "owner")
    throw new CliError("permission_error", `only the owner can ${question.replace(/\?$/, "")}`, {
      reason: "identity.owner-only",
    })
  return who
}

export const matchAnswer = (row: IdentityLinkRow) => ({
  id: row.id,
  kind: "identity_link" as const,
  persons: row.persons,
  joins: row.joins,
  identity: row.identity,
  with: row.with,
  signal: row.signal,
  score: row.score,
  shared: row.shared,
  mailbox: row.mailbox,
  candidates: row.candidates,
  reason: row.reason,
  evidence: row.evidence,
  proposedBy: row.proposedBy,
  createdAt: row.createdAt,
})

/**
 * A split names one `person`, never a `persons` pair: an app that reads every row with two persons as a match would
 * offer to confirm a split under a merge's words.
 */
export const splitAnswer = (row: IdentitySplitRow) => ({
  id: row.id,
  kind: "identity_split" as const,
  split: row.split,
  person: row.person,
  identities: row.identities,
  merge: row.merge,
  reason: row.reason,
  evidence: row.evidence,
  proposedBy: row.proposedBy,
  createdAt: row.createdAt,
})

export type PeopleProposal = ReturnType<typeof matchAnswer> | ReturnType<typeof splitAnswer>

export const summaryOf = (row: PeopleProposal): string => {
  if (row.kind === "identity_link") {
    const why = [row.signal, ...(row.mailbox ? [`shared mailbox ${row.mailbox}`] : [])]
    const score = row.score === null ? "" : `, score ${row.score}`
    return `${row.identity} may be the same person as ${row.with ?? row.persons[1]} (${why.join(", ")}${score})`
  }
  return row.split === "unmerge"
    ? `undo ${row.merge}: ${row.identities.join(" ")} go back to their own person`
    : `take ${row.identities.join(" ")} off ${row.person}`
}

export const PROPOSAL_KINDS = ["all", "link", "split"] as const

export type ProposalKindWord = (typeof PROPOSAL_KINDS)[number]

const scoreOf = (row: PeopleProposal): number => (row.kind === "identity_link" ? (row.score ?? -1) : -1)

/**
 * The matches and splits waiting for the owner, highest score first, those without one newest first after them
 * (NEED-2527), at most `limit`, and whether more wait.
 */
export const waiting = async (
  store: MessageStore,
  { kind, limit }: { kind: ProposalKindWord; limit: number },
): Promise<{ items: PeopleProposal[]; hasMore: boolean }> => {
  const none = { items: [], hasMore: false }
  const page = { status: "proposed" as const, limit, offset: 0 }
  const links = kind === "split" ? none : await store.people.linkProposals({ ...page, order: "score" })
  const splits = kind === "link" ? none : await store.people.splitProposals(page)
  const rows: PeopleProposal[] = [...links.items.map(matchAnswer), ...splits.items.map(splitAnswer)].sort(
    (a, b) => scoreOf(b) - scoreOf(a) || b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id),
  )
  return { items: rows.slice(0, limit), hasMore: links.hasMore || splits.hasMore || rows.length > limit }
}
