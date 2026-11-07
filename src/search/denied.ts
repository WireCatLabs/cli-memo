import { DEAL_KINDS, type DealKind } from "@wirecat/cli-core"
import { environmentOf } from "@wirecat/cli-core/cli"
import { levelFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { memoLevels } from "../mcp/permissions.js"

/**
 * The CRM kinds whose list memo's permissions deny, so `search all` leaves them out instead of showing their titles
 * under another key (SEC-151). cli-core's `deniedKinds` reads a messenger profile's settings, which memo has none of;
 * the levels here are memo's own, made stricter by an MCP server's `--permission`.
 */
export const deniedCrmKinds = (command: Command, env: NodeJS.ProcessEnv): { kind: DealKind; why: string }[] => {
  const levels = memoLevels(env, environmentOf(command).agent?.overrides ?? [])
  return DEAL_KINDS.filter((kind) => levelFor(levels, `${kind}s.list`, {}).level === "deny").map((kind) => ({
    kind,
    why: `memo's permissions deny ${kind}s.list`,
  }))
}
