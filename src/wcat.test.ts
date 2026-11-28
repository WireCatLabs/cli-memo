import { readFileSync } from "node:fs"
import { captureStreams } from "@wirecat/cli-base"
import { describeProgram } from "@wirecat/cli-base/commands"
import { buildManifest, manifestText } from "@wirecat/cli-base/wcat/manifest"
import { expect, it } from "vitest"
import { createProgram } from "./program.js"
import { WCAT } from "./wcat.js"

const root = new URL("../", import.meta.url)

it("builds the shipped WireCat manifest from wcat's own commands, identity and permission keys", () => {
  const manifest = buildManifest({
    identity: WCAT,
    commands: describeProgram(createProgram({ env: process.env, streams: captureStreams() })),
    pkg: JSON.parse(readFileSync(new URL("package.json", root), "utf8")),
    skills: true,
  })
  expect(manifestText(manifest)).toBe(readFileSync(new URL("contracts/wirecat.json", root), "utf8"))
  expect(WCAT.permissionOf?.(["facts", "remove"])).toBe("facts.remove")
  expect(WCAT.permissionOf?.([])).toBeNull()
})
