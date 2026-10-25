import { CliError } from "@wirecat/cli-base"
import { setupPermissionCeiling } from "@wirecat/cli-core/cli"
import { CEILING_KEY, type Level, layerPermissions, levelFor } from "@wirecat/cli-core/sends"
import type { Command } from "commander"
import { configPath, loadConfig } from "../config.js"
import { issueMessage, memoPermissionKeys, permissionIssues } from "../config-issues.js"
import { readOnly } from "../read-only.js"

export const OWNER_PERMISSIONS = [
  "meetings.actions.confirm",
  "meetings.actions.reject",
  "projects.annotations.restore",
] as const

const ORDER = { deny: 0, readonly: 1, ask: 2, allow: 3 }

export const memoLevels = (
  env: NodeJS.ProcessEnv,
  overrides: readonly string[] = [],
  defaults: Record<string, Level> = { "mcp.authority": "deny" },
) => {
  const saved = loadConfig(env).permissions ?? {}
  const changed: Record<string, Level> = {}
  for (const entry of overrides) {
    const match = /^([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)=(deny|readonly|ask|allow)$/.exec(entry)
    if (!match)
      throw new CliError("validation_error", "--permission takes a command path and level, e.g. notes.edit=deny")
    changed[match[1] as string] = match[2] as Level
  }
  const levels = layerPermissions([
    ["server", changed],
    ["config", saved],
  ]).levels
  for (const key of new Set([...Object.keys(changed), ...Object.keys(saved), ...Object.keys(defaults)])) {
    if (ORDER[levelFor(levels, key, defaults).level] > ORDER[levelFor(saved, key, defaults).level])
      throw new CliError("permission_error", `--permission would loosen the saved permission for ${key}`)
  }
  const effective = Object.fromEntries(
    [...new Set([...Object.keys(levels), ...Object.keys(defaults)])].map((key) => [
      key,
      levelFor(levels, key, defaults).level,
    ]),
  )
  const ceiling = setupPermissionCeiling(env)
  return ceiling === undefined ? effective : { ...effective, [CEILING_KEY]: ceiling }
}

/** A key no command checks would do nothing: the server refuses to start, saved or passed with --permission. */
export const refuseUnknownPermissions = (env: NodeJS.ProcessEnv, program: Command, overrides: readonly string[]) => {
  const saved = Object.keys(loadConfig(env).permissions ?? {})
  const issues = permissionIssues(program, configPath(env), saved)
  if (issues.length > 0) throw new CliError("configuration_error", issueMessage(issues), { permission: issues[0]?.key })
  const known = memoPermissionKeys(program)
  const key = overrides.map((entry) => entry.split("=")[0] ?? "").find((one) => !known.has(one))
  if (key !== undefined)
    throw new CliError("validation_error", `--permission ${key} names no command`, { permission: key })
}

export const mcpOwnerAllowed = (env: NodeJS.ProcessEnv, key: string): boolean => {
  if (env.AI_AGENT !== "memo-mcp" || readOnly(env)) return false
  const level = levelFor(memoLevels(env), key, { [key]: "deny" }).level
  return level === "ask" || level === "allow"
}
