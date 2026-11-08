import { CliError } from "@wirecat/cli-base"
import { RESOURCES_SEARCHED, type SearchAllFound, type SearchedResource } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { grantedLevel } from "../mcp/granted.js"

export const BUSINESS_KEY = "business.list"

/** The list command that guards each kind the business lane finds; a kind memo has no command for has no key yet. */
const LIST_KEYS: Readonly<Record<string, string>> = {
  invoice: "invoices.list",
  payment: "payments.list",
  order: "orders.list",
  contract: "contracts.list",
  subscription: "subscriptions.list",
  product: "products.list",
  wallet: "wallets.list",
}

type LeftOut = SearchAllFound["skipped"][number]

const leftOut = (what: string, key: string): LeftOut => ({
  code: "permission_error",
  resource: "business",
  reason: `${what} left out: memo's MCP server denies ${key}`,
})

export interface BusinessGate {
  only: SearchedResource[] | undefined
  skipped: LeftOut[]
  shows: (item: { kind: string }) => boolean
}

/**
 * What `search all` may show an MCP client of the business lane: none of it when `business.list` is denied, and no
 * hit of a kind whose own list is denied, so a search never shows the titles that list would refuse (cli-core's
 * SEC-144). memo checks permissions only for an MCP client, so the owner's terminal reads everything.
 */
export const businessGate = (command: Command, asked: SearchedResource[] | undefined): BusinessGate => {
  const lanes = asked ?? [...RESOURCES_SEARCHED]
  if (!lanes.includes("business")) return { only: asked, skipped: [], shows: () => true }
  if (grantedLevel(command, BUSINESS_KEY) === "deny") {
    const only = lanes.filter((lane) => lane !== "business")
    const skipped = [leftOut("business", BUSINESS_KEY)]
    if (!only.length)
      throw new CliError("permission_error", `search all has nothing it may read: ${skipped[0]?.reason}`, {
        reason: "search.all-denied",
        permission: BUSINESS_KEY,
      })
    return { only, skipped, shows: () => true }
  }
  const denied = Object.entries(LIST_KEYS).filter(([, key]) => grantedLevel(command, key) === "deny")
  const hidden = new Set(denied.map(([kind]) => kind))
  return {
    only: asked,
    skipped: denied.map(([kind, key]) => leftOut(kind, key)),
    shows: (item: { kind: string }) => !hidden.has(item.kind),
  }
}
