import { DEAL_KINDS, type DealKind } from "@wirecat/cli-core"
import { deniedKindsOf, environmentOf, type LeftOut } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { memoLevels } from "../mcp/permissions.js"

/**
 * The CRM kinds memo's permissions deny, an MCP server's `--permission` included: what `search all`, the contexts
 * and `relationships list` leave out (SEC-151).
 */
export const deniedCrm = (command: Command, env: NodeJS.ProcessEnv): LeftOut<DealKind>[] =>
  deniedKindsOf(memoLevels(env, environmentOf(command).agent?.overrides ?? []), DEAL_KINDS, "memo's permissions")

export const deniedCrmKinds = (command: Command, env: NodeJS.ProcessEnv): DealKind[] =>
  deniedCrm(command, env).map(({ kind }) => kind)
