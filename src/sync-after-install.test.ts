import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@wirecat/cli-base"
import { syncAfterInstallCases } from "@wirecat/cli-core/testing"
import { beforeEach, describe, it } from "vitest"
import { reportFailure } from "./failure.js"
import { createProgram } from "./program.js"

let env: NodeJS.ProcessEnv

const memo = async (args: string[], more: NodeJS.ProcessEnv = {}) => {
  const streams = captureStreams()
  let code = 0
  const program = createProgram({
    streams,
    env: { ...env, ...more },
    setExitCode: (given) => {
      code = given
    },
  })
  try {
    await program.exitOverride().parseAsync(args, { from: "user" })
  } catch (error) {
    code = reportFailure(error, { args, program, streams, tty: false })
  }
  return { code, err: streams.stderr.join(""), out: streams.stdout.join("") }
}

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "memo-install-"))
  env = {
    ...process.env,
    MESSAGING_STORE: join(root, "messages.db"),
    MEMO_CONFIG_DIR: join(root, "config"),
    MEMO_STATE_DIR: join(root, "state"),
  }
  const vault = join(root, "vault")
  mkdirSync(join(vault, "Projects"), { recursive: true })
  writeFileSync(join(vault, "Projects", "Lighthouse.md"), "Kickoff of the lighthouse project.\n")
  await memo(["folders", "add", vault])
})

describe("sync runs right after install, whatever the shared WireCat config holds", () => {
  for (const one of syncAfterInstallCases({
    sync: ["sync", "--only", "notes", "--no-embed"],
    run: (argv, more) => memo(argv, more),
  }))
    it(one.name, () => one.run())
})
