import { CliError, configFilePath, resolvePaths, saveConfigFile } from "@wirecat/cli-base"
import {
  type ConfigIssue,
  checkConfigText,
  issueMessage,
  readConfigFile,
  readConfigText,
  settingPathOf,
  withoutSetting,
} from "@wirecat/cli-core/cli"
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
  /** `false` keeps only failed runs in `memo runs list`. `--record` and `--no-record` win. */
  record: v.optional(v.boolean()),
  keep_runs_for_days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  keep_successful_runs_for_days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  runs_size_limit_mb: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  /** `false` leaves what was typed out of a run's command line, `"failed"` out of a successful one; secrets always. */
  record_input: v.optional(v.union([v.boolean(), v.literal("failed")])),
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
          /** `false` hands the account's import to the `mail` CLI: memo's sync skips it; rules, delete, restore and inspect keep working. */
          import: v.optional(v.boolean()),
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

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const path = configPath(env)
  const read = readConfigText(path)
  if ("issue" in read) throw new CliError("configuration_error", issueMessage([read.issue], "memo doctor"))
  if (read.text === undefined) return {}
  const { issues, config } = checkConfigText(read.text, { file: path, tool: "memo", schema: ConfigSchema })
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
  const read = readConfigText(path)
  if ("issue" in read) return { path, found: true, issues: [read.issue], config: {} }
  if (read.text === undefined) return { path, found: false, issues: [], config: {} }
  const { issues, config } = checkConfigText(read.text, {
    file: path,
    tool: "memo",
    schema: ConfigSchema,
    knownPermissions: memoPermissionKeys(program),
  })
  return { path, found: true, issues, config: config ?? {} }
}

/** Removes one setting by its dotted path, whatever the schema thinks of it or of the rest of the file. */
export const unsetConfigKey = (key: string, env: NodeJS.ProcessEnv = process.env): boolean => {
  if (settingPathOf(key).some((part) => part === ""))
    throw new CliError("validation_error", `${key} is not a setting path`)
  const path = configPath(env)
  const read = readConfigFile(path)
  if ("issue" in read) throw new CliError("configuration_error", issueMessage([read.issue], "memo doctor"))
  const { config, removed } = withoutSetting(read.raw, key)
  if (removed) saveConfigFile(path, config)
  return removed
}

/** Changes one part of the config and keeps the rest as written. */
export const updateConfig = (change: (config: Config) => Config, env: NodeJS.ProcessEnv = process.env): Config => {
  const next = change(loadConfig(env))
  saveConfigFile(configPath(env), next)
  return next
}
