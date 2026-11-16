import type { ManifestIdentity } from "@wirecat/cli-base/wcat/manifest"
import { APP } from "./app.js"

// The bin hands this to wcatStart before the program loads, so it must not import the command tree; src/wcat.ts adds
// the permission keys for the manifest.
export const DESKTOP: ManifestIdentity = {
  command: APP.command,
  version: APP.version,
  description: APP.description,
  appName: APP.appName,
  envPrefix: APP.envPrefix,
  docs: "https://wirecat.dev/en/docs/memo",
  tagline: "Notes, people and memories in one place for your agent",
  syncs: "notes and mail",
  // The default endpoints of the readers and AI models; the owner may point either at another address.
  hosts: ["api.openai.com", "api.anthropic.com", "localhost", "127.0.0.1"],
  userHosts: "the web pages you add as sources, and the address you set for a reader or an AI model",
}
