#!/usr/bin/env node
import { enableCompileCache } from "node:module"
import { wcatStart } from "@wirecat/cli-base/wcat/start"
import { DESKTOP } from "../identity.js"

// Compiling the program's module files is most of a start; later runs reuse what this one compiled.
enableCompileCache()
const wcat = await wcatStart(DESKTOP)
if (wcat.code !== undefined) {
  process.exitCode = wcat.code
} else {
  const { startCli } = await import("@wirecat/cli-core/cli/start")
  const { memoEntry } = await import("../run/entry.js")
  await startCli(memoEntry())
}
