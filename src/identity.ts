import type { ManifestIdentity } from "@wirecat/cli-base/wcat/manifest"
import { APP } from "./app.js"

// The bin hands this to wcatStart before the program loads, so it must not import the command tree; src/wcat.ts adds
// the permission keys for the manifest.
// The name in `wcat <name>` is `wirecat`: the launcher and the manifest both look for the program wcat-<name>, and
// this package ships wcat-wirecat, while help, hints and MCP tool names use the command people type, `wcat`.
export const DESKTOP: ManifestIdentity = {
  command: "wirecat",
  version: APP.version,
  description: APP.description,
  appName: APP.appName,
  envPrefix: APP.envPrefix,
  docs: "https://wirecat.dev/en/docs/wcat",
  tagline: "People, memories and context in one place for agents",
  syncs: "mail and people",
  mcpPort: 8767,
  // The default endpoints of the AI models; the owner may point one at another address.
  hosts: ["api.openai.com", "api.anthropic.com", "localhost", "127.0.0.1"],
  userHosts: "the address you set for an AI model",
}
