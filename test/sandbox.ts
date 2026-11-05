import { join } from "node:path"
import { assumeTerminal } from "../src/terminal.js"

// Runs after @wirecat/cli-base/testing/setup, which already points TMPDIR, HOME, XDG and the store into a sandbox.
process.env.MEMO_SYSTEMCTL = join(import.meta.dirname, "fake-systemctl.mjs")
delete process.env.MEMO_AUTO
// Set when the suite runs inside an agent's terminal; it would make every write the agent's.
delete process.env.AI_AGENT
delete process.env.CLAUDECODE
assumeTerminal({ present: true })
