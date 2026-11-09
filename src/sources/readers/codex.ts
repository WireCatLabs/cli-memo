import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { firstLine, runProgram } from "./process.js"
import type { Reader } from "./types.js"

/**
 * The owner's own signed-in Codex CLI in a read-only sandbox and an empty folder. It is an agent that can still read
 * files of this computer, which `readers` says.
 */
export const codex: Reader = {
  id: "codex",
  title: "Codex CLI",
  provider: "openai",
  leavesComputer: true,
  readsFiles: true,
  needsModel: false,
  probe: async ({ env, signal }) => {
    const version = await runProgram("codex", ["--version"], { env, ...(signal ? { signal } : {}) })
    if (version?.code !== 0)
      return { available: false, signedIn: null, version: null, models: null, problem: "Codex CLI is not installed" }
    const status = await runProgram("codex", ["login", "status"], { env, ...(signal ? { signal } : {}) })
    const signedIn = status?.code === 0
    return {
      available: true,
      signedIn,
      version: firstLine(version.stdout),
      models: null,
      problem: signedIn ? null : "Codex CLI is not signed in: run codex login",
    }
  },
  read: async ({ env, signal }, { system, prompt, model }) => {
    const folder = mkdtempSync(join(tmpdir(), "memo-reader-"))
    const answer = join(folder, "answer.txt")
    try {
      const ran = await runProgram(
        "codex",
        [
          "exec",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--color",
          "never",
          "--cd",
          folder,
          "--output-last-message",
          answer,
          ...(model ? ["--model", model] : []),
          "-",
        ],
        // codex exec has no system prompt of its own; the instructions lead the input.
        { env, cwd: folder, stdin: `${system}\n\n${prompt}`, ...(signal ? { signal } : {}) },
      )
      if (!ran)
        throw new CliError("configuration_error", "Codex CLI is not installed", { reason: "reader.unavailable" })
      if (ran.code !== 0)
        throw new CliError("invalid_response", `Codex CLI failed: ${firstLine(ran.stderr || ran.stdout)}`, {
          reason: "reader.failed",
        })
      try {
        return readFileSync(answer, "utf8")
      } catch {
        return ran.stdout
      }
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  },
}
