import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { expect, it, vi } from "vitest"
import { configPath, loadConfig } from "../config.js"
import { createProgram } from "../program.js"
import { himalaya } from "./himalaya.js"

vi.mock("./himalaya.js", () => ({ himalaya: vi.fn() }))

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "memo-account-setup-"))
  const env = {
    ...process.env,
    HOME: root,
    MEMO_CONFIG_DIR: join(root, "memo"),
    HIMALAYA_CONFIG: join(root, "himalaya.toml"),
  }
  writeFileSync(
    env.HIMALAYA_CONFIG,
    '[accounts.first]\nemail = "first@example.test"\n[accounts.chosen]\nemail = "chosen@example.test"\n',
  )
  const runHimalaya = vi.fn().mockResolvedValue(
    JSON.stringify({
      accounts: [
        { name: "first", default: true },
        { name: "chosen", default: false },
      ],
    }),
  )
  vi.mocked(himalaya).mockReturnValue(runHimalaya)
  const run = (args: string[]) =>
    createProgram({ env, streams: captureStreams() }).exitOverride().parseAsync(args, { from: "user" })
  return { env, run, runHimalaya }
}

it("adds only the named account, matches its email and checks it without rewriting configuration", async () => {
  const f = fixture()
  await f.run(["mail", "add", "chosen", "chosen@example.test", "--kind", "imap", "--folder", "Archive", "--json"])
  expect(loadConfig(f.env).mail?.accounts).toEqual([
    { name: "chosen", address: "chosen@example.test", mode: "imap", folders: ["Archive"] },
  ])
  expect(f.runHimalaya).toHaveBeenCalledWith(["account", "list", "--json", "--config", f.env.HIMALAYA_CONFIG])
  const before = readFileSync(configPath(f.env), "utf8")
  await f.run(["mail", "check", "chosen", "--json"])
  expect(readFileSync(configPath(f.env), "utf8")).toBe(before)
})

it("refuses a missing account, mismatched address or duplicate instead of choosing the default", async () => {
  const f = fixture()
  await expect(f.run(["mail", "add"])).rejects.toThrow(/first, chosen/)
  await expect(f.run(["mail", "add", "chosen", "first@example.test"])).rejects.toThrow(/must match/)
  await f.run(["mail", "add", "chosen", "chosen@example.test"])
  const before = readFileSync(configPath(f.env), "utf8")
  await expect(f.run(["mail", "add", "chosen", "chosen@example.test"])).rejects.toThrow(/already/)
  await expect(f.run(["mail", "check"])).rejects.toThrow(/choices: chosen/)
  expect(readFileSync(configPath(f.env), "utf8")).toBe(before)
})

it("does not expose TOML values or parser errors when configuration is invalid", async () => {
  const f = fixture()
  writeFileSync(f.env.HIMALAYA_CONFIG, '[accounts.chosen]\nemail = "not-closed')
  await expect(f.run(["mail", "add", "chosen", "chosen@example.test"])).rejects.toThrow(
    "the selected Himalaya TOML configuration cannot be read",
  )
})

it("takes the address from the IMAP login, or the SMTP one, when the account sets no email", async () => {
  const f = fixture()
  writeFileSync(
    f.env.HIMALAYA_CONFIG,
    '[accounts.first]\nimap.sasl.plain.username = "first@example.test"\n' +
      '[accounts.chosen]\nimap.sasl.login.username = "chosen"\nsmtp.sasl.plain.authcid = "chosen@example.test"\n',
  )
  await f.run(["mail", "add", "first", "first@example.test"])
  await f.run(["mail", "add", "chosen", "chosen@example.test"])
  expect(loadConfig(f.env).mail?.accounts?.map((one) => one.address)).toEqual([
    "first@example.test",
    "chosen@example.test",
  ])
  await f.run(["mail", "check", "chosen", "--json"])
})

it("names the file and the line to add when neither email nor login is an address, without the login", async () => {
  const f = fixture()
  writeFileSync(f.env.HIMALAYA_CONFIG, '[accounts.chosen]\nimap.sasl.plain.username = "private-login-name"\n')
  const error = await f.run(["mail", "add", "chosen", "chosen@example.test"]).catch((e: Error) => e)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toBe(
    "Himalaya's account chosen names no email address, and its login is not one. " +
      'Add this line under [accounts.chosen] in ~/himalaya.toml: email = "you@example.com"',
  )
  expect((error as Error).message).not.toContain("private-login-name")
})
