import { Credentials, isMovedRun, resolvePaths } from "@wirecat/cli-base"
import { APP } from "../../app.js"
import type { ReaderContext } from "./types.js"

/** Providers whose API key memo keeps. */
export const KEY_PROVIDERS = ["openai", "anthropic"] as const
export type KeyProvider = (typeof KEY_PROVIDERS)[number]

/**
 * The owner's API key for a provider, in the keyring entry memo's enrichment reads too. No environment variable is
 * read: a key in the environment may be another tool's, and the owner gives memo one on purpose.
 */
export const providerKeys = ({ env, keyring }: Pick<ReaderContext, "env" | "keyring">) => {
  const where = { appName: APP.appName, prefix: APP.envPrefix, env }
  const credentials = new Credentials({
    configDir: resolvePaths(where).config,
    service: APP.appName,
    isolated: isMovedRun(where),
    storage: "keyring",
    env,
    ...(keyring ? { keyring } : {}),
  })
  const account = (provider: KeyProvider) => `embeddings:${provider}`
  return {
    read: (provider: KeyProvider): string | undefined => credentials.read(account(provider))?.secret,
    write: (provider: KeyProvider, key: string) => credentials.write(account(provider), key, { signIn: true }),
    remove: (provider: KeyProvider) => credentials.remove(account(provider)),
  }
}
