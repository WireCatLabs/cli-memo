import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { mayMigrate } from "./check.js"

/** A global install as npm lays it out: the program in its bin folder is a link to the package's own file. */
const install = () => {
  const root = mkdtempSync(join(tmpdir(), "wcat-check-"))
  const script = join(root, "lib", "node_modules", "@wirecat", "wirecat", "dist", "bin", "wcat-wirecat.js")
  mkdirSync(join(script, ".."), { recursive: true })
  writeFileSync(script, "")
  mkdirSync(join(root, "bin"))
  const link = join(root, "bin", "wcat-wirecat")
  symlinkSync(script, link)
  const checkout = join(root, "wirecat", "dist", "bin", "wcat-wirecat.js")
  mkdirSync(join(checkout, ".."), { recursive: true })
  writeFileSync(checkout, "")
  // The account's own home, with the state folder somewhere empty: nothing here reads the owner's files.
  const env = { HOME: userInfo().homedir, XDG_DATA_HOME: join(root, "data") }
  return { link, script, checkout, env }
}

it.skipIf(process.platform === "win32")("moves memo's files only from an installed wcat, through npm's link", () => {
  const { link, script, env } = install()
  expect(mayMigrate(env, "linux", link)).toBe(true)
  expect(mayMigrate(env, "linux", script)).toBe(true)
})

it("never moves anything from a checkout or its dist/, as cli-dev lint and the smoke run it", () => {
  const { checkout, env } = install()
  expect(mayMigrate(env, "linux", checkout)).toBe(false)
  expect(mayMigrate(env, "linux", undefined)).toBe(false)
})

it.each(["WCAT", "MEMO"])("never moves anything while a %s_*_DIR variable moves a folder", (prefix) => {
  const { script, env } = install()
  for (const kind of ["CONFIG", "STATE", "CACHE"])
    expect(mayMigrate({ ...env, [`${prefix}_${kind}_DIR`]: "/elsewhere" }, "linux", script)).toBe(false)
})

it("never moves anything when HOME is not the account's own home", () => {
  const { script, env } = install()
  expect(mayMigrate({ ...env, HOME: mkdtempSync(join(tmpdir(), "wcat-other-home-")) }, "linux", script)).toBe(false)
})

it("stays off once the marker says the move is done", () => {
  const { script, env } = install()
  mkdirSync(join(env.XDG_DATA_HOME, "wcat"), { recursive: true })
  writeFileSync(join(env.XDG_DATA_HOME, "wcat", "migrated-from-memo.json"), JSON.stringify({ keyring: "done" }))
  expect(mayMigrate(env, "linux", script)).toBe(false)
})
