import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { syncAfterInstallCases } from "@wirecat/cli-core/testing"
import { beforeEach, describe, it } from "vitest"
import { reportFailure } from "./failure.js"
import { createProgram } from "./program.js"

let env: NodeJS.ProcessEnv

const wcat = async (args: string[], more: NodeJS.ProcessEnv = {}) => {
  const streams = captureStreams()
  let code = 0
  const program = createProgram({ streams, env: { ...env, ...more } })
  try {
    await program.exitOverride().parseAsync(args, { from: "user" })
    code = Number(process.exitCode ?? 0)
  } catch (error) {
    code = reportFailure(error, { args, program, streams, tty: false })
  }
  process.exitCode = undefined
  return { code, err: streams.stderr.join(""), out: streams.stdout.join("") }
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "wcat-install-"))
  env = {
    ...process.env,
    MESSAGING_STORE: join(root, "messages.db"),
    WCAT_CONFIG_DIR: join(root, "config"),
    WCAT_STATE_DIR: join(root, "state"),
  }
})

describe("sync runs right after install, whatever the shared WireCat config holds", () => {
  for (const one of syncAfterInstallCases({
    sync: ["sync", "--only", "people", "--no-embed"],
    run: (argv, more) => wcat(argv, more),
  }))
    it(one.name, () => one.run())
})
