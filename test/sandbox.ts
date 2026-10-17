import { join } from "node:path"

// Runs after @wirecat/cli-base/testing/setup, which already points TMPDIR, HOME, XDG and the store into a sandbox.
process.env.HIMALAYA_CONFIG = join(process.env.TMPDIR ?? "", "himalaya.toml")
process.env.MEMO_HIMALAYA = join(import.meta.dirname, "fake-himalaya.mjs")
process.env.MEMO_SYSTEMCTL = join(import.meta.dirname, "fake-systemctl.mjs")
process.env.MEMO_HIMALAYA_RETRY_MS = "0"
delete process.env.MEMO_AUTO
// Set when the suite runs inside an agent's terminal; it would make every write the agent's.
delete process.env.AI_AGENT
delete process.env.CLAUDECODE
