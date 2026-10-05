import { configFilePath, loadConfigFile, resolvePaths } from "@leemour/cli-core"
import * as v from "valibot"

const ConfigSchema = v.object({
  notes: v.optional(v.object({ folders: v.array(v.string()), ignore: v.optional(v.array(v.string())) })),
  mail: v.optional(v.object({ accounts: v.array(v.object({ name: v.string(), address: v.string() })) })),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export const configPath = (env: NodeJS.ProcessEnv = process.env): string =>
  configFilePath(resolvePaths({ appName: "cli-memo", prefix: "MEMO", env }).config)

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config =>
  loadConfigFile(configPath(env), ConfigSchema, () => ({}))
