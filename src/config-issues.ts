import { knownPermissionKeys } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { LANE_KEYS } from "./search/lane-gates.js"

const pathOf = (command: Command): string[] => {
  const words: string[] = []
  for (let at = command; at.parent; at = at.parent) words.unshift(at.name())
  return words
}

/**
 * Memo's permission keys are command paths, plus the MCP server's own `mcp.authority` and the keys that turn a lane of
 * `search all` off, such as `business.list`, as in cli-core: no one command lists that lane.
 */
export const permissionKeyOf = (command: Command) => pathOf(command).join(".") || null

export const memoPermissionKeys = (program: Command) =>
  knownPermissionKeys(program, permissionKeyOf, ["mcp.authority", ...LANE_KEYS])
