import { CliError } from "@wirecat/cli-base"
import { DEAL_KINDS, type DealKind } from "@wirecat/cli-core"
import { RESOURCES_SEARCHED, type SearchAllFound, type SearchedResource } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { grantedLevel } from "../mcp/granted.js"

/**
 * The permission keys that guard a lane of `search all`: `key` turns the whole lane off, and each kind's own list key
 * keeps that kind's hits out, so a search never shows the titles its list would refuse (cli-core's SEC-144).
 */
interface LaneGate {
  lane: SearchedResource
  key: string
  kinds: Readonly<Record<string, string>>
}

export const LANE_GATES: readonly LaneGate[] = [
  {
    lane: "business",
    key: "business.list",
    kinds: {
      invoice: "invoices.list",
      payment: "payments.list",
      order: "orders.list",
      contract: "contracts.list",
      subscription: "subscriptions.list",
      product: "products.list",
      wallet: "wallets.list",
    },
  },
  { lane: "crm", key: "crm.list", kinds: { deal: "deals.list", lead: "leads.list" } },
]

/** The lane keys no command path carries, which memo still accepts from `--permission` and the config file. */
export const LANE_KEYS = LANE_GATES.map(({ key }) => key)

type Skipped = SearchAllFound["skipped"][number]

export interface LanesAllowed {
  only: SearchedResource[] | undefined
  /** The CRM kinds the lane reads, when a list denies the others: cli-core then leaves them out before it ranks. */
  crmKinds?: DealKind[]
  skipped: Skipped[]
  /** Absent when no kind is hidden. */
  shows?: (item: { kind: string }) => boolean
}

const leftOut = (lane: SearchedResource, what: string, key: string): Skipped => ({
  code: "permission_error",
  resource: lane,
  reason: `${what} left out: memo's MCP server denies ${key}`,
})

/**
 * What `search all` may read and show an MCP client. memo checks permissions only for an MCP client, so a run at the
 * owner's terminal reads everything.
 */
export const lanesFor = (command: Command, asked: SearchedResource[] | undefined): LanesAllowed => {
  const lanes = asked ?? [...RESOURCES_SEARCHED]
  const denied = (key: string) => grantedLevel(command, key) === "deny"
  const skipped: Skipped[] = []
  const hidden = new Set<string>()
  const off = new Set<SearchedResource>()
  for (const gate of LANE_GATES) {
    if (!lanes.includes(gate.lane)) continue
    if (denied(gate.key)) {
      off.add(gate.lane)
      skipped.push(leftOut(gate.lane, gate.lane, gate.key))
      continue
    }
    for (const [kind, key] of Object.entries(gate.kinds))
      if (denied(key)) {
        hidden.add(kind)
        skipped.push(leftOut(gate.lane, kind, key))
      }
    if (Object.keys(gate.kinds).every((kind) => hidden.has(kind))) off.add(gate.lane)
  }
  const shows = hidden.size ? { shows: (item: { kind: string }) => !hidden.has(item.kind) } : {}
  const crmKinds = DEAL_KINDS.filter((kind) => !hidden.has(kind))
  const narrowed = crmKinds.length < DEAL_KINDS.length && !off.has("crm") ? { crmKinds } : {}
  if (!off.size) return { only: asked, ...narrowed, skipped, ...shows }
  const only = lanes.filter((lane) => !off.has(lane))
  if (!only.length)
    throw new CliError(
      "permission_error",
      `search all has nothing it may read: ${skipped.map(({ reason }) => reason).join("; ")}`,
      { reason: "search.all-denied" },
    )
  return { only, ...narrowed, skipped, ...shows }
}
