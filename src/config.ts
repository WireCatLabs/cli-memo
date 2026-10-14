import { configFilePath, resolvePaths, saveConfigFile } from "@wirecat/cli-base"
import { loadSnakeCaseConfig } from "@wirecat/cli-core/cli"
import * as v from "valibot"
import { DIALECTS } from "./notes/dialects/index.js"

const ConfigSchema = v.object({
  notes: v.optional(
    v.object({
      /** A bare path is the form before folder ids; `memo folders add` turns it into an entry. */
      folders: v.array(
        v.union([
          v.string(),
          v.object({
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
        v.object({ dir: v.pipe(v.string(), v.minLength(1)), format: v.optional(v.picklist(DIALECTS)) }),
      ),
    }),
  ),
  auto: v.optional(v.object({ enabled: v.optional(v.boolean()), every: v.optional(v.string()) })),
  mail: v.optional(
    v.object({
      accounts: v.array(
        v.object({
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
              v.object({
                match: v.object({
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

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config =>
  loadSnakeCaseConfig(configPath(env), ConfigSchema, () => ({}))

/** Changes one part of the config and keeps the rest as written. */
export const updateConfig = (change: (config: Config) => Config, env: NodeJS.ProcessEnv = process.env): Config => {
  const next = change(loadConfig(env))
  saveConfigFile(configPath(env), next)
  return next
}
