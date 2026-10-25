import { knownPermissionKeys } from "@wirecat/cli-core/cli"
import type { Command } from "commander"

const pathOf = (command: Command): string[] => {
  const words: string[] = []
  for (let at = command; at.parent; at = at.parent) words.unshift(at.name())
  return words
}

/** Memo's permission keys are command paths, plus the MCP server's own `mcp.authority`. */
export const permissionKeyOf = (command: Command) => pathOf(command).join(".") || null

export const memoPermissionKeys = (program: Command) => knownPermissionKeys(program, permissionKeyOf, ["mcp.authority"])
