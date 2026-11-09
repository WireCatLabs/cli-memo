import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { firstLine, runProgram } from "./process.js"
import type { Reader } from "./types.js"

/**
 * The owner's own signed-in Claude Code, with every tool, MCP server, hook, slash command and saved session off,
 * started in an empty folder: it only reads the text on stdin and answers.
 */
export const claudeCode: Reader = {
  id: "claude-code",
  title: "Claude Code",
  provider: "anthropic",
  leavesComputer: true,
  readsFiles: false,
  needsModel: false,
  probe: async ({ env, signal }) => {
    const version = await runProgram("claude", ["--version"], { env, ...(signal ? { signal } : {}) })
    if (version?.code !== 0)
      return {
        available: false,
        signedIn: null,
        version: null,
        models: null,
        problem: "Claude Code is not installed",
      }
    const status = await runProgram("claude", ["auth", "status", "--json"], { env, ...(signal ? { signal } : {}) })
    let signedIn = false
    try {
      signedIn = (JSON.parse(status?.stdout ?? "") as { loggedIn?: unknown }).loggedIn === true
    } catch {}
    return {
      available: true,
      signedIn,
      version: firstLine(version.stdout),
      models: null,
      problem: signedIn ? null : "Claude Code is not signed in: run claude auth login",
    }
  },
  read: async ({ env, signal }, { system, prompt, model }) => {
    const folder = mkdtempSync(join(tmpdir(), "memo-reader-"))
    try {
      const ran = await runProgram(
        "claude",
        [
          "--print",
          "--output-format",
          "text",
          "--tools",
          "",
          "--disallowedTools",
          "mcp__*",
          "--strict-mcp-config",
          "--settings",
          '{"disableAllHooks":true}',
          "--disable-slash-commands",
          "--no-session-persistence",
          "--system-prompt",
          system,
          ...(model ? ["--model", model] : []),
        ],
        { env, cwd: folder, stdin: prompt, ...(signal ? { signal } : {}) },
      )
      if (!ran)
        throw new CliError("configuration_error", "Claude Code is not installed", { reason: "reader.unavailable" })
      if (ran.code !== 0)
        throw new CliError("invalid_response", `Claude Code failed: ${firstLine(ran.stderr || ran.stdout)}`, {
          reason: "reader.failed",
        })
      return ran.stdout
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  },
}
