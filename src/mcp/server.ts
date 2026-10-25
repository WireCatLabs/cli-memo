import { type CallToolResult, McpServer } from "@modelcontextprotocol/server"
import { CliError, mcpErrorResult } from "@wirecat/cli-base"
import { agentResult, type Body, sealed, UNTRUSTED_INSTRUCTION } from "@wirecat/cli-core/cli"
import { type McpCommand, registerCommands } from "@wirecat/cli-core/mcp"
import type { Level } from "@wirecat/cli-core/sends"
import { openStore } from "@wirecat/cli-core/store"
import * as v from "valibot"
import { STORE_CLIENT } from "../app.js"
import { mcpFailure } from "../failure.js"
import { readOnly } from "../read-only.js"
import { VERSION } from "../version.js"
import { commandCatalogue, type ProgramFactory } from "./catalogue.js"
import { memoLevels, OWNER_PERMISSIONS, refuseUnknownPermissions } from "./permissions.js"

export const AGENT = "memo-mcp"
export const INSTRUCTIONS = [
  "The owner's stored messages, mail, notes and meetings, with facts, memories and proposed actions.",
  "Find commands with memo_tools_search; call their CLI path with memo_read or memo_write and the advertised arguments.",
  "Search all combines messages, mail and notes. Search meetings needs one explicit source account.",
  "Open search references with notes show, messages show (messages and emails) or meetings passage before citing evidence.",
  "What happened is a fact (facts add); a conclusion is a memory (memories add). Both stay proposed until confirmed.",
  "Propose outbound work with actions add; it sends nothing. Meeting/project actions stage cited findings before review.",
  "Look for existing facts and memories first. Save only what will matter later and cite the evidence you read.",
  "Project membership requires confirmed links; a mention is not membership. Preserve unknown speakers and archive coverage.",
  "Meeting preparation reads stored context; future times stay unverified. Select communications explicitly.",
  "Project decisions follow agent_decisions. Meeting decisions and annotation restore require explicit saved permissions.",
  "Every command call is logged without its arguments.",
  UNTRUSTED_INSTRUCTION,
].join("\n")

const answer = (body: Body): CallToolResult => {
  const value = sealed(body)
  const result = agentResult({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  })
  if (Buffer.byteLength(result.content[0]?.text ?? "") > 4 * 1024 * 1024)
    throw new CliError("invalid_response", "the answer exceeds 4 MiB — lower limit or ask for less", {
      reason: "output.too-large",
      max_bytes: 4 * 1024 * 1024,
    })
  return result
}

export const createMemoServer = (
  env: NodeJS.ProcessEnv,
  createProgram: ProgramFactory,
  overrides: readonly string[] = [],
): McpServer => {
  const server = new McpServer({ name: "memo", version: VERSION }, { instructions: INSTRUCTIONS })
  const catalogue = commandCatalogue(env, createProgram)
  const defaults: Record<string, Level> = Object.fromEntries(
    catalogue.tools.filter((tool) => tool.writes).map((tool) => [catalogue.keyOf(tool.path), "ask" as const]),
  )
  defaults["mcp.authority"] = "deny"
  for (const key of OWNER_PERMISSIONS) defaults[key] = "deny"
  const levels = () => memoLevels(env, overrides, defaults)
  levels()
  refuseUnknownPermissions(env, catalogue.program, overrides)
  const allowed = (path: readonly string[], writes: boolean) => {
    const current = levels()
    if (readOnly(env) && writes) throw new CliError("permission_error", "memo is locked to reads")
    const availability = catalogue.availability(path, current)
    if (!availability.available)
      throw new CliError("permission_error", `${path.join(" ")}: ${availability.reason}`, {
        ...(availability.permission ? { permission: availability.permission } : {}),
      })
    return current
  }
  const commands: Record<string, McpCommand> = {}
  for (const tool of catalogue.tools) {
    const input = v.strictObject(tool.input.entries)
    commands[tool.command] = {
      availability: () => {
        try {
          allowed(tool.path, tool.writes)
          return { available: true }
        } catch (error) {
          if (!(error instanceof CliError) || error.code !== "permission_error") throw error
          return {
            available: false,
            reason: error.message,
            ...(typeof error.details.permission === "string" ? { permission: error.details.permission } : {}),
          }
        }
      },
      title: tool.title,
      description: tool.description,
      writes: tool.writes,
      input,
      checked: true,
      run: async (args) => {
        const startedAt = Date.now()
        let result: CallToolResult
        try {
          const current = allowed(tool.path, tool.writes)
          const run = await catalogue.run(tool.path, v.parse(input, args), current)
          result = "error" in run ? agentResult(mcpErrorResult(run.error)) : answer(run.result as Body)
        } catch (error) {
          result = mcpFailure(error)
        }
        const store = await openStore({ env, ...STORE_CLIENT }).catch(() => undefined)
        if (store) {
          try {
            const code = (result.structuredContent as { error?: { code?: string } } | undefined)?.error?.code
            await store.agentActions.record({
              actor: { bot: AGENT },
              tool: tool.path.join("_").replaceAll("-", "_"),
              tier: tool.writes ? "write-private" : "read",
              status: result.isError ? "failed" : "ok",
              ...(code === undefined ? {} : { error: code }),
              startedAt,
              finishedAt: Date.now(),
            })
          } finally {
            await store.close()
          }
        }
        return result
      },
    }
  }
  registerCommands(server, "memo", commands, undefined, (asked) => {
    const tool = catalogue.tools.find((one) => one.command === asked)
    if (tool) allowed(tool.path, tool.writes)
  })
  return server
}
