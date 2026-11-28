import { existsSync } from "node:fs"
import { delimiter, join } from "node:path"
import { assumeTerminal } from "../src/terminal.js"

// Runs after @wirecat/cli-base/testing/setup, which already points TMPDIR, HOME, XDG and the store into a sandbox.
process.env.WCAT_SYSTEMCTL = join(import.meta.dirname, "fake-systemctl.mjs")
delete process.env.WCAT_AUTO
// Set when the suite runs inside an agent's terminal; it would make every write the agent's.
delete process.env.AI_AGENT
delete process.env.CLAUDECODE
assumeTerminal({ present: true })
// An installed files CLI on the developer's PATH must never run under a test; tests that need one put test/fake-files first.
process.env.PATH = (process.env.PATH ?? "")
  .split(delimiter)
  .filter((dir) => !existsSync(join(dir, "wcat-files")))
  .join(delimiter)
