import { existsSync, readFileSync } from "node:fs"
import { CliError, configFilePath, resolvePaths, saveConfigFile } from "@wirecat/cli-base"
import { type ConfigIssue, checkConfigText, issueMessage } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import * as v from "valibot"
import { memoPermissionKeys } from "./config-issues.js"
import { DIALECTS } from "./notes/dialects/index.js"

const ConfigSchema = v.strictObject({
  permissions: v.optional(v.record(v.string(), v.picklist(["deny", "readonly", "ask", "allow"]))),
  notes: v.optional(
    v.strictObject({
      /** A bare path is the form before folder ids; `memo folders add` turns it into an entry. */
      folders: v.array(
        v.union([
          v.string(),
          v.strictObject({
            id: v.pipe(v.string(), v.minLength(1)),
            path: v.pipe(v.string(), v.minLength(1)),
            format: v.optional(v.picklist(DIALECTS)),
          }),
        ]),
      ),
      ignore: v.optional(v.array(v.string())),
      /** `false` keeps notes out of search by meaning: `memo sync` does not embed them. */
      embed: v.optional(v.boolean()),
      /** Where `memo notes export` and `--export` write internal notes when no folder is given. */
      export: v.optional(
        v.strictObject({ dir: v.pipe(v.string(), v.minLength(1)), format: v.optional(v.picklist(DIALECTS)) }),
      ),
    }),
  ),
  auto: v.optional(
    v.strictObject({
      enabled: v.optional(v.boolean()),
      every: v.optional(v.string()),
      /** MEMO_CONFIG_DIR, MESSAGING_STORE… as they were at `memo jobs start`, passed to every timer run. */
      places: v.optional(v.record(v.string(), v.string())),
    }),
  ),
  /** `true` keeps every run in `memo runs list`; `false` keeps not even failed ones. `--record` and `--no-record` win. */
  record: v.optional(v.boolean()),
  keep_runs_for_days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  /** `false` stops the once-a-day check for a newer memo. */
  update_check: v.optional(v.boolean()),
  /** `false` stops an agent deciding proposals for you: `projects actions confirm` and `reject` then need you. */
  agent_decisions: v.optional(v.boolean()),
  mail: v.optional(
    v.strictObject({
      accounts: v.array(
        v.strictObject({
          name: v.string(),
          address: v.string(),
          /** `mbox` reads a Google Takeout file at `path`; give it the Gmail account's address, so both are one set. */
          mode: v.optional(v.picklist(["gmail", "imap", "mbox"])),
          path: v.optional(v.pipe(v.string(), v.minLength(1))),
          folders: v.optional(v.array(v.string())),
          embed: v.optional(v.boolean()),
          /** The owner's keep, envelope and skip decisions per sender, domain or list; written by `memo mail rules`. */
          rules: v.optional(
            v.array(
              v.strictObject({
                match: v.strictObject({
                  from: v.optional(v.string()),
                  domain: v.optional(v.string()),
                  list_id: v.optional(v.string()),
                }),
                action: v.picklist(["skip", "envelope", "keep"]),
                reason: v.optional(v.string()),
                decided_at: v.string(),
              }),
            ),
          ),
        }),
      ),
      /** The most characters of an email body kept; 1,000,000 by default. */
      max_body_chars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      /** The most characters of one attachment's extracted text kept; 200,000 by default. */
      max_attachment_chars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    }),
  ),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  configFilePath(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).config)

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const path = configPath(env)
  const text = readText(path)
  if (text === undefined) return {}
  const { issues, config } = checkConfigText(text, { file: path, tool: "memo", schema: ConfigSchema })
  if (issues.length > 0 || config === undefined)
    throw new CliError("configuration_error", issueMessage(issues, "memo doctor"))
  return config
}

/** For `doctor`: every problem in the file, and what of it still loads, without refusing. */
export const inspectConfig = (
  env: NodeJS.ProcessEnv,
  program: Command,
): { path: string; found: boolean; issues: ConfigIssue[]; config: Config } => {
  const path = configPath(env)
  const text = readText(path)
  if (text === undefined) return { path, found: existsSync(path), issues: [], config: {} }
  const { issues, config } = checkConfigText(text, {
    file: path,
    tool: "memo",
    schema: ConfigSchema,
    knownPermissions: memoPermissionKeys(program),
  })
  return { path, found: true, issues, config: config ?? {} }
}

const without = (raw: unknown, at: readonly string[]): unknown => {
  if (at.length === 0) return {}
  const copy = structuredClone(raw)
  const parent = at.slice(0, -1).reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], copy)
  const last = at.at(-1) as string
  if (Array.isArray(parent) && /^\d+$/.test(last)) parent.splice(Number(last), 1)
  else if (typeof parent === "object" && parent !== null) delete (parent as Record<string, unknown>)[last]
  return copy
}

/** Removes one setting by its dotted path, whatever the schema thinks of it or of the rest of the file. */
export const unsetConfigKey = (key: string, env: NodeJS.ProcessEnv = process.env): boolean => {
  const path = configPath(env)
  const text = readText(path)
  if (text === undefined) return false
  const { issues, config: raw } = checkConfigText(text, { file: path, tool: "memo", schema: v.unknown() })
  if (issues.length > 0) throw new CliError("configuration_error", issueMessage(issues, "memo doctor"))
  const at = key.startsWith("permissions.") ? ["permissions", key.slice("permissions.".length)] : key.split(".")
  if (at.some((part) => part === "")) throw new CliError("validation_error", `${key} is not a setting path`)
  let next = without(raw, at)
  // An unset that empties a section removes the section too, as the shared `config unset` does.
  for (let parent = at.slice(0, -1); parent.length > 0; parent = parent.slice(0, -1)) {
    const node = parent.reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], next)
    if (typeof node !== "object" || node === null || Object.keys(node).length > 0) break
    next = without(next, parent)
  }
  if (JSON.stringify(next) === JSON.stringify(raw)) return false
  saveConfigFile(path, next)
  return true
}

/** Changes one part of the config and keeps the rest as written. */
export const updateConfig = (change: (config: Config) => Config, env: NodeJS.ProcessEnv = process.env): Config => {
  const next = change(loadConfig(env))
  saveConfigFile(configPath(env), next)
  return next
}
