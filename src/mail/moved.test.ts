import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { describeProgram, flatten } from "@wirecat/cli-base/commands"
import { describe, expect, it } from "vitest"
import { createProgram } from "../program.js"
import { MOVED_TO_MAIL } from "./moved.js"

describe("memo's mail-writing commands moved to the mail CLI", () => {
  it.each(MOVED_TO_MAIL)("memo mail %s fails, names %s and touches nothing", async (from, to) => {
    const root = mkdtempSync(join(tmpdir(), "memo-moved-"))
    const env = { ...process.env, MEMO_CONFIG_DIR: join(root, "config"), MESSAGING_STORE: join(root, "store.db") }
    const streams = captureStreams()
    const argv = ["mail", ...from.split(" "), "personal", "extra.json", "--run", "r1", "--domain", "x.example"]

    await expect(
      createProgram({ env, streams })
        .exitOverride()
        .parseAsync([...argv, "--yes", "--json"], { from: "user" }),
    ).rejects.toMatchObject({
      code: "validation_error",
      message: expect.stringContaining(`run ${to}`),
      details: { reason: "mail.moved-to-mail-cli", cli: "mail", alternative: to },
    })
    expect(existsSync(env.MESSAGING_STORE)).toBe(false)
    expect(readdirSync(root)).toEqual([])
    expect(streams.stdout.join("")).toBe("")
  })

  it("are hidden from discovery, so nothing offers them", () => {
    const paths = flatten(describeProgram(createProgram())).map(({ path }) => path.join(" "))

    expect(paths).toContain("mail inspect")
    for (const [from] of MOVED_TO_MAIL) expect(paths).not.toContain(`mail ${from}`)
  })
})
