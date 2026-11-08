import { rootOf } from "@wirecat/cli-core/cli"
import { type Level, levelFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"

const granted = new WeakMap<Command, Record<string, Level>>()

/**
 * The MCP server's levels for one call, kept beside the program that runs it: memo's keys are its own, so they
 * cannot ride in the run's `--permission` overrides, which the tasks commands hand to cli-core's settings.
 */
export const grantLevels = (program: Command, levels: Record<string, Level>) => {
  granted.set(program, levels)
}

/**
 * The MCP server's level for a key no command path carries, such as the business lane of `search all`. A run at the
 * owner's terminal reads every key: memo checks permissions only for an MCP client.
 */
export const grantedLevel = (command: Command, key: string): Level | undefined => {
  const levels = granted.get(rootOf(command))
  return levels === undefined ? undefined : levelFor(levels, key).level
}
