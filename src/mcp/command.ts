import type { Streams } from "@wirecat/cli-base"
import { annotate, customizeSharedCommand } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE, sharedCommandTemplate } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { APP } from "../app.js"
import { SHELL_OVERRIDES } from "../contract-overrides.js"
import type { ProgramFactory } from "./catalogue.js"

const mcpCommandDefinition = (
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  createProgram: ProgramFactory,
): void => {
  annotate(program.command("mcp"), { effects: LOCAL_WRITE, lifetime: "persistent" })
    .description("serve memo commands over MCP on stdio, limited by saved permissions")
    .option(
      "--permission <key=level>",
      "tighten one saved permission for this server; repeat for more keys",
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .action(async (options: { permission?: string[] }) => {
      const { serveStdio } = await import("@modelcontextprotocol/server/stdio")
      const { createMemoServer } = await import("./server.js")
      serveStdio(() => createMemoServer(env, createProgram, options.permission), {
        onerror: (error) => streams.diagnostic(`mcp: ${error.message}`),
      })
      await new Promise<void>((resolve) => {
        process.stdin.once("end", resolve)
        process.stdin.once("close", resolve)
        process.once("SIGINT", resolve)
        process.once("SIGTERM", resolve)
      })
    })
}

export const mcpCommand = (...args: Parameters<typeof mcpCommandDefinition>) =>
  customizeSharedCommand(
    sharedCommandTemplate(APP, "mcp"),
    "Memo delegates MCP framing and command dispatch to Core over stdio while binding its local store, saved permissions and environment; it has no HTTP transport.",
    () => {
      mcpCommandDefinition(...args)
      const command = args[0].commands.find((command) => command.name() === "mcp")
      if (!command) throw new Error("mcp builder did not install its command")
      return command
    },
    SHELL_OVERRIDES.mcp,
  )
