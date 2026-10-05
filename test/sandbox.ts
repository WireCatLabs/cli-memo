import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll } from "vitest"

// A test run once migrated the owner's real message store and lost its history (2026-09-22).
// Every path the program can reach — the shared store, config, mail and notes — points in here.
const sandbox = mkdtempSync(join(tmpdir(), "memo-test-"))

process.env.HOME = join(sandbox, "home")
process.env.XDG_CONFIG_HOME = join(sandbox, "config")
process.env.XDG_STATE_HOME = join(sandbox, "state")
process.env.XDG_CACHE_HOME = join(sandbox, "cache")
process.env.XDG_DATA_HOME = join(sandbox, "data")
process.env.MEMO_CONFIG_DIR = join(sandbox, "memo-config")
process.env.MEMO_STATE_DIR = join(sandbox, "memo-state")
process.env.MEMO_CACHE_DIR = join(sandbox, "memo-cache")
process.env.MESSAGING_STORE = join(sandbox, "messages.db")
process.env.HIMALAYA_CONFIG = join(sandbox, "himalaya.toml")
process.env.MEMO_HIMALAYA = join(import.meta.dirname, "fake-himalaya.mjs")
process.env.MEMO_SYSTEMCTL = join(import.meta.dirname, "fake-systemctl.mjs")
delete process.env.MEMO_AUTO
process.env.TMPDIR = sandbox
process.env.MEMO_TEST_SANDBOX = sandbox

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))
