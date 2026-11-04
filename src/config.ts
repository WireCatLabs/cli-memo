import { CliError, configFilePath, resolvePaths, saveConfigFile } from "@wirecat/cli-base"
import {
  type ConfigIssue,
  checkConfigText,
  type DeclaredSetting,
  issueMessage,
  KEEP_RUNS_FOR_DAYS,
  KEEP_SUCCESSFUL_RUNS_FOR_DAYS,
  RUNS_SIZE_LIMIT_MB,
  readConfigFile,
  readConfigText,
  settingPathOf,
  withoutSetting,
  withSettingDefaults,
} from "@wirecat/cli-core/cli"
import { MAX_ATTACHMENT_CHARS, MAX_BODY_CHARS } from "@wirecat/cli-core/mail"
import { DEFAULT_DECISION_POLICY, type DecisionPolicy } from "@wirecat/cli-core/store"
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
  /** Retired: memo no longer imports mail, the `mail` CLI does. Still loads so an old config works; doctor names it. */
  mail: v.optional(v.unknown()),
})

export type Config = v.InferOutput<typeof ConfigSchema>

/**
 * Every setting written into the file with its default, so the owner sees and edits it there (WC-CMD-30). Each default
 * is the one the code applies when the key is missing. Lists are left out, and so is `auto`: `memo jobs start` keeps it.
 */
export const MEMO_SETTINGS: readonly DeclaredSetting[] = [
  {
    key: "agent_decisions",
    default: DEFAULT_DECISION_POLICY.agentDecisions,
    description: "true lets an agent confirm or reject proposals for you; false keeps every decision yours",
  },
  { key: "update_check", default: true, description: "check once a day for a newer memo" },
  { key: "record", default: true, description: "keep every run in memo runs list; false keeps failed runs only" },
  {
    key: "record_input",
    default: true,
    description: 'keep what was typed in a run\'s command line: true, false, or "failed" for failed runs only',
  },
  { key: "keep_runs_for_days", default: KEEP_RUNS_FOR_DAYS, description: "days a run is kept" },
  {
    key: "keep_successful_runs_for_days",
    default: KEEP_SUCCESSFUL_RUNS_FOR_DAYS,
    description: "days a successful run is kept",
  },
  { key: "runs_size_limit_mb", default: RUNS_SIZE_LIMIT_MB, description: "the most megabytes all runs may take" },
  { key: "notes.embed", default: true, description: "false keeps notes out of search by meaning" },
  { key: "mail.max_body_chars", default: MAX_BODY_CHARS, description: "the most characters of an email body kept" },
  {
    key: "mail.max_attachment_chars",
    default: MAX_ATTACHMENT_CHARS,
    description: "the most characters of one attachment's text kept",
  },
]

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

/** The owner's `agent_decisions` for every store check: off unless set to `true`, and off when the config does not load. */
export const decisionPolicy = (env: NodeJS.ProcessEnv): DecisionPolicy => {
  let agentDecisions = false
  try {
    agentDecisions = loadConfig(env).agent_decisions === true
  } catch {}
  return { ...DEFAULT_DECISION_POLICY, agentDecisions }
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

/** Changes one part of the config and keeps the rest as written, adding any setting the file lacks at its default. */
export const updateConfig = (change: (config: Config) => Config, env: NodeJS.ProcessEnv = process.env): Config => {
  const next = change(loadConfig(env))
  saveConfigFile(configPath(env), withSettingDefaults(next, MEMO_SETTINGS).config)
  return next
}

/** The file as written, for `config show` and `config migrate`. */
export const rawConfig = (env: NodeJS.ProcessEnv = process.env): unknown => {
  const read = readConfigFile(configPath(env))
  if ("issue" in read) throw new CliError("configuration_error", issueMessage([read.issue], "memo doctor"))
  return read.raw
}

/** Writes each setting the file lacks at its default, on the file as written: values, order and unknown keys stay. */
export const migrateConfig = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const { config, added } = withSettingDefaults(rawConfig(env), MEMO_SETTINGS)
  if (added.length > 0) saveConfigFile(configPath(env), config)
  return added
}
