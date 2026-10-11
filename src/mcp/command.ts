import { serveStdio } from "@modelcontextprotocol/server/stdio"
import type { Streams } from "@wirecat/cli-base"
import type { Command } from "commander"
import { createMemoServer } from "./server.js"

export const mcpCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  program
    .command("mcp")
    .description("Serve memories, proposed actions and the agent log to an agent over MCP, on stdin and stdout")
    .action(async () => {
      serveStdio(() => createMemoServer(env), { onerror: (error) => streams.diagnostic(`mcp: ${error.message}`) })
      await new Promise<void>((resolve) => {
        process.stdin.once("end", resolve)
        process.stdin.once("close", resolve)
        process.once("SIGINT", resolve)
        process.once("SIGTERM", resolve)
      })
    })
}
