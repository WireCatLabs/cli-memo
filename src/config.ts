import { configFilePath, loadConfigFile, resolvePaths, saveConfigFile } from "@leemour/cli-core"
import * as v from "valibot"

const ConfigSchema = v.object({
  notes: v.optional(
    v.object({
      folders: v.array(v.string()),
      ignore: v.optional(v.array(v.string())),
      embed: v.optional(v.boolean()),
    }),
  ),
  auto: v.optional(v.object({ enabled: v.optional(v.boolean()), every: v.optional(v.string()) })),
  mail: v.optional(
    v.object({
      accounts: v.array(
        v.object({
          name: v.string(),
          address: v.string(),
          mode: v.optional(v.picklist(["gmail", "imap"])),
          folders: v.optional(v.array(v.string())),
          embed: v.optional(v.boolean()),
        }),
      ),
    }),
  ),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  configFilePath(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).config)

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config =>
  loadConfigFile(configPath(env), ConfigSchema, () => ({}))

/** Changes one part of the config and keeps the rest as written. */
export const updateConfig = (change: (config: Config) => Config, env: NodeJS.ProcessEnv = process.env): Config => {
  const next = change(loadConfig(env))
  saveConfigFile(configPath(env), next)
  return next
}
