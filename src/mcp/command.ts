import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import type { ProgramFactory } from "./catalogue.js"

export const mcpCommand = (
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
