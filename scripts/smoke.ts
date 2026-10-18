// The built command under the running runtime (`bun scripts/smoke.ts`): a note written and read back from a fresh store.
import { strict as assert } from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const bin = fileURLToPath(new URL("../dist/bin/memo.js", import.meta.url))
const home = mkdtempSync(join(tmpdir(), "memo-smoke-"))
const env = {
  PATH: process.env.PATH ?? "",
  HOME: home,
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_STATE_HOME: join(home, "state"),
  XDG_CACHE_HOME: join(home, "cache"),
  XDG_DATA_HOME: join(home, "data"),
}
const memo = (...args: string[]) =>
  JSON.parse(execFileSync(process.execPath, [bin, ...args, "--json"], { env, encoding: "utf8", timeout: 30_000 }))
try {
  assert.equal(memo("notes", "add", "smoke note").item.ref, "note:1")
  assert.equal(memo("notes", "list").items[0].text, "smoke note")
  console.log("smoke: ok")
} finally {
  rmSync(home, { recursive: true, force: true })
}
